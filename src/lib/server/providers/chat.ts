import { validateThesisReport } from "../analysis/report-validation.ts";
import { thesisRequestBody } from "../analysis/packet.ts";
import {
  classifyCatalogModel,
  parseCatalogPayload,
  type DraftThesisResult,
  type ModelCatalog,
  type ModelCatalogEntry,
  type ProviderOptions,
  type ThesisPacket,
  type ThesisProvider,
  type UsageRecord,
} from "./contracts.ts";

type CompletionPayload = {
  content: string | null;
  usage: UsageRecord | null;
  usageCost: number | null;
};

function readUsage(body: unknown): { usage: UsageRecord | null; usageCost: number | null } {
  if (
    !body ||
    typeof body !== "object" ||
    !("usage" in body) ||
    (body as { usage?: unknown }).usage == null
  ) {
    return { usage: null, usageCost: null };
  }
  const usage = (body as { usage: Record<string, unknown> }).usage;
  const numberOrNull = (value: unknown) => (typeof value === "number" ? value : null);
  return {
    usage: {
      promptTokens: numberOrNull(usage.prompt_tokens),
      completionTokens: numberOrNull(usage.completion_tokens),
      totalTokens: numberOrNull(usage.total_tokens),
    },
    usageCost: typeof usage.cost === "number" ? usage.cost : null,
  };
}

function readContent(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" ? message.content : null;
}

function failedDraft(
  packet: ThesisPacket,
  modelId: string,
  patch: Partial<DraftThesisResult>,
): DraftThesisResult {
  return {
    draftingFailed: true,
    repairAttempted: false,
    refusal: null,
    error: null,
    report: null,
    packet,
    usage: null,
    usageCost: null,
    modelId,
    ...patch,
  };
}

export function createChatProvider(input: {
  id: ThesisProvider["id"];
  baseUrl: string;
  options: ProviderOptions;
}): ThesisProvider {
  const fetchImpl = input.options.fetch ?? fetch;
  const now = input.options.now ?? (() => new Date().toISOString());
  const baseUrl = input.baseUrl.replace(/\/$/, "");

  async function request(path: string, init?: RequestInit): Promise<Response> {
    return fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${input.options.apiKey}`,
        "content-type": "application/json",
        ...init?.headers,
      },
    });
  }

  async function discoverModels(): Promise<ModelCatalog> {
    const response = await request("/models");
    const body = await response.json();
    return {
      provider: input.id,
      baseUrl,
      retrievedAt: now(),
      entries: parseCatalogPayload(body).map(classifyCatalogModel),
    };
  }

  function selectionStatus(modelId: string, entries: ModelCatalogEntry[]) {
    const found = entries.find((entry) => entry.id === modelId);
    if (!found) return { status: "removed" as const, modelId };
    if (!found.compatible) {
      return { status: "incompatible" as const, modelId, reason: found.reason ?? undefined };
    }
    return { status: "available" as const, modelId };
  }

  async function complete(
    modelId: string,
    packet: ThesisPacket,
    repair: boolean,
  ): Promise<
    | { ok: true; payload: CompletionPayload }
    | { ok: false; status: number; kind: "auth" | "rate_limit" | "transport" }
  > {
    const response = await request("/chat/completions", {
      method: "POST",
      body: thesisRequestBody({ modelId, packet, repair }),
    });
    if (response.status === 401) return { ok: false, status: 401, kind: "auth" };
    if (response.status === 429) return { ok: false, status: 429, kind: "rate_limit" };
    if (!response.ok) return { ok: false, status: response.status, kind: "transport" };
    const body = await response.json();
    const usage = readUsage(body);
    return {
      ok: true,
      payload: { content: readContent(body), ...usage },
    };
  }

  async function draftThesis(draftInput: {
    modelId: string;
    catalog: ModelCatalogEntry[];
    packet: ThesisPacket;
  }): Promise<DraftThesisResult> {
    const status = selectionStatus(draftInput.modelId, draftInput.catalog);
    if (status.status !== "available") {
      return failedDraft(draftInput.packet, draftInput.modelId, {
        refusal: status.status,
        error: {
          kind: "invalid_report",
          status: null,
          message:
            status.status === "removed"
              ? "Selected model was removed"
              : "Selected model is incompatible",
        },
      });
    }

    const first = await complete(draftInput.modelId, draftInput.packet, false);
    if (!first.ok) {
      return failedDraft(draftInput.packet, draftInput.modelId, {
        error: { kind: first.kind, status: first.status, message: first.kind },
      });
    }

    const parsed = tryParse(first.payload.content);
    const validated = parsed.ok ? validateThesisReport(parsed.value, draftInput.packet) : null;
    if (parsed.ok && validated?.ok) {
      return {
        draftingFailed: false,
        repairAttempted: false,
        refusal: null,
        error: null,
        report: validated.report,
        packet: draftInput.packet,
        usage: first.payload.usage,
        usageCost: first.payload.usageCost,
        modelId: draftInput.modelId,
      };
    }

    const second = await complete(draftInput.modelId, draftInput.packet, true);
    if (!second.ok) {
      return failedDraft(draftInput.packet, draftInput.modelId, {
        repairAttempted: true,
        error: { kind: second.kind, status: second.status, message: second.kind },
      });
    }
    const repaired = tryParse(second.payload.content);
    const repairedValidation = repaired.ok
      ? validateThesisReport(repaired.value, draftInput.packet)
      : null;
    if (!repaired.ok || !repairedValidation?.ok) {
      return failedDraft(draftInput.packet, draftInput.modelId, {
        repairAttempted: true,
        error: {
          kind: "invalid_report",
          status: null,
          message:
            repairedValidation && !repairedValidation.ok
              ? repairedValidation.reasons.join("; ")
              : "Malformed report",
        },
        usage: second.payload.usage,
        usageCost: second.payload.usageCost,
      });
    }
    return {
      draftingFailed: false,
      repairAttempted: true,
      refusal: null,
      error: null,
      report: repairedValidation.report,
      packet: draftInput.packet,
      usage: second.payload.usage,
      usageCost: second.payload.usageCost,
      modelId: draftInput.modelId,
    };
  }

  return {
    id: input.id,
    baseUrl,
    discoverModels,
    selectionStatus,
    draftThesis,
  };
}

function tryParse(content: string | null): { ok: true; value: unknown } | { ok: false } {
  if (!content) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch {
    return { ok: false };
  }
}
