import { validateThesisReport } from "../analysis/report-validation.ts";
import { thesisRequestBody } from "../analysis/packet.ts";
import {
  ProviderError,
  classifyCatalogModel,
  parseCatalogPayload,
  type DraftThesisResult,
  type ModelTest,
  type ProviderErrorKind,
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
    usageCost:
      typeof usage.cost === "number"
        ? usage.cost
        : // xAI reports cost in ticks: 1 USD = 10^10 ticks.
          typeof usage.cost_in_usd_ticks === "number"
          ? usage.cost_in_usd_ticks / 1e10
          : null,
  };
}

function readContent(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" ? message.content : null;
}

const CATALOG_TIMEOUT_MS = 15_000;
const DRAFT_TIMEOUT_MS = 120_000;

function statusKind(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  return "transport";
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

  /** The whole exchange, body included, is bounded by the timeout. */
  async function request(
    path: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<{ status: number; ok: boolean; text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${input.options.apiKey}`,
          "content-type": "application/json",
          ...init.headers,
        },
      });
      return { status: response.status, ok: response.ok, text: await response.text() };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ProviderError("timeout", `${path} timed out after ${timeoutMs}ms`);
      }
      const detail = error instanceof Error ? error.message : "request failed";
      throw new ProviderError("transport", `${path} failed: ${detail}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function discoverModels(): Promise<ModelCatalog> {
    const response = await request("/models", {}, input.options.timeoutMs ?? CATALOG_TIMEOUT_MS);
    if (!response.ok) {
      throw new ProviderError(
        statusKind(response.status),
        `Model catalog request failed with HTTP ${response.status}`,
        response.status,
      );
    }
    const body = tryParse(response.text);
    if (!body.ok) throw new ProviderError("transport", "Model catalog response is not JSON");
    return {
      provider: input.id,
      baseUrl,
      retrievedAt: now(),
      entries: parseCatalogPayload(body.value).map(classifyCatalogModel),
    };
  }

  async function testModel(modelId: string): Promise<ModelTest> {
    const testedAt = now();
    try {
      const response = await request(
        "/chat/completions",
        {
          method: "POST",
          body: JSON.stringify({
            model: modelId,
            temperature: 0,
            max_tokens: 2000,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "Reply with a JSON object only." },
              { role: "user", content: 'Return {"ok": true}.' },
            ],
          }),
        },
        input.options.timeoutMs ?? DRAFT_TIMEOUT_MS,
      );
      if (!response.ok) {
        return { ok: false, reason: `HTTP ${response.status}`, testedAt };
      }
      const body = tryParse(response.text);
      const content = body.ok ? readContent(body.value) : null;
      const parsed = tryParse(content);
      const answered =
        parsed.ok && !!parsed.value && (parsed.value as { ok?: unknown }).ok === true;
      return answered
        ? { ok: true, reason: null, testedAt }
        : { ok: false, reason: "The reply was not the requested JSON object", testedAt };
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof ProviderError ? error.message : "test failed",
        testedAt,
      };
    }
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
    rejected?: string[],
  ): Promise<
    | { ok: true; payload: CompletionPayload }
    | { ok: false; status: number | null; kind: ProviderErrorKind; message: string }
  > {
    let response;
    try {
      response = await request(
        "/chat/completions",
        { method: "POST", body: thesisRequestBody({ modelId, packet, rejected }) },
        input.options.timeoutMs ?? DRAFT_TIMEOUT_MS,
      );
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      return { ok: false, status: null, kind: error.kind, message: error.message };
    }
    if (!response.ok) {
      const kind = statusKind(response.status);
      return {
        ok: false,
        status: response.status,
        kind,
        message: `${kind} (HTTP ${response.status})`,
      };
    }
    const parsedBody = tryParse(response.text);
    const body = parsedBody.ok ? parsedBody.value : null;
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

    const first = await complete(draftInput.modelId, draftInput.packet);
    if (!first.ok) {
      return failedDraft(draftInput.packet, draftInput.modelId, {
        error: { kind: first.kind, status: first.status, message: first.message },
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

    const rejected = !parsed.ok
      ? ["the response was not valid JSON"]
      : validated && !validated.ok
        ? validated.reasons
        : ["malformed report"];
    const second = await complete(draftInput.modelId, draftInput.packet, rejected);
    if (!second.ok) {
      return failedDraft(draftInput.packet, draftInput.modelId, {
        repairAttempted: true,
        error: { kind: second.kind, status: second.status, message: second.message },
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
    testModel,
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
