import { validateThesisReport } from "../analysis/report-validation.ts";
import { thesisRequestBody } from "../analysis/packet.ts";
import {
  pickExplanationRequestBody,
  validatePickExplanation,
} from "../analysis/pick-explanation.ts";
import {
  ProviderError,
  classifyCatalogModel,
  parseCatalogPayload,
  type DraftPickExplanationResult,
  type DraftThesisResult,
  type PickExplanationPacket,
  type ModelTest,
  type ProviderErrorKind,
  type ModelCatalog,
  type ModelCatalogEntry,
  type ProviderOptions,
  type ProviderRequestRecord,
  type ThesisPacket,
  type ThesisProvider,
  type UsageRecord,
} from "./contracts.ts";

type CompletionPayload = {
  content: string | null;
  usage: UsageRecord | null;
  usageCost: number | null;
};

type Exchange =
  | { ok: true; payload: CompletionPayload; requestId: string }
  | {
      ok: false;
      status: number | null;
      kind: ProviderErrorKind;
      message: string;
      requestId: string;
    };

function requestRecord(
  role: ProviderRequestRecord["role"],
  exchange: Exchange,
): ProviderRequestRecord {
  const usage = exchange.ok ? exchange.payload.usage : null;
  const usageCost = exchange.ok ? exchange.payload.usageCost : null;
  return {
    requestId: exchange.requestId,
    role,
    outcome: exchange.ok ? "completed" : exchange.kind === "timeout" ? "ambiguous" : "failed",
    response: exchange.ok ? exchange.payload.content : null,
    promptTokens: usage?.promptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    costUsd: usageCost,
    costKnown: usageCost !== null,
  };
}

function readRequestId(body: unknown): string {
  if (body && typeof body === "object" && typeof (body as { id?: unknown }).id === "string") {
    return (body as { id: string }).id;
  }
  return "unreported";
}

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

/** What both draft kinds share. The wrappers add their own packet. */
type DraftCore<Report> = Omit<DraftThesisResult, "report" | "packet"> & { report: Report | null };

function failedDraft<Report>(
  modelId: string,
  patch: Partial<DraftCore<Report>>,
): DraftCore<Report> {
  return {
    draftingFailed: true,
    repairAttempted: false,
    refusal: null,
    error: null,
    report: null,
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

  async function complete(body: string): Promise<Exchange> {
    let response;
    try {
      response = await request(
        "/chat/completions",
        { method: "POST", body },
        input.options.timeoutMs ?? DRAFT_TIMEOUT_MS,
      );
    } catch (error) {
      if (!(error instanceof ProviderError)) throw error;
      return {
        ok: false,
        status: null,
        kind: error.kind,
        message: error.message,
        requestId: "unreported",
      };
    }
    if (!response.ok) {
      const kind = statusKind(response.status);
      const parsed = tryParse(response.text);
      return {
        ok: false,
        status: response.status,
        kind,
        message: `${kind} (HTTP ${response.status})`,
        requestId: parsed.ok ? readRequestId(parsed.value) : "unreported",
      };
    }
    const parsedBody = tryParse(response.text);
    const parsedValue = parsedBody.ok ? parsedBody.value : null;
    const usage = readUsage(parsedValue);
    return {
      ok: true,
      requestId: readRequestId(parsedValue),
      payload: { content: readContent(parsedValue), ...usage },
    };
  }

  /**
   * One draft and at most one repair, with no provider fallback. Every exchange becomes a
   * request record, including a repair that fails in transit.
   */
  async function draftJson<Report>(args: {
    modelId: string;
    catalog: ModelCatalogEntry[];
    body: (rejected?: string[]) => string;
    validate: (value: unknown) => { ok: true; report: Report } | { ok: false; reasons: string[] };
  }): Promise<DraftCore<Report>> {
    const status = selectionStatus(args.modelId, args.catalog);
    if (status.status !== "available") {
      return failedDraft(args.modelId, {
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

    const first = await complete(args.body());
    const firstRecord = requestRecord("draft", first);
    if (!first.ok) {
      return failedDraft(args.modelId, {
        error: { kind: first.kind, status: first.status, message: first.message },
        providerRequests: [firstRecord],
      });
    }

    const parsed = tryParse(first.payload.content);
    const validated = parsed.ok ? args.validate(parsed.value) : null;
    if (parsed.ok && validated?.ok) {
      return {
        draftingFailed: false,
        repairAttempted: false,
        refusal: null,
        error: null,
        report: validated.report,
        usage: first.payload.usage,
        usageCost: first.payload.usageCost,
        providerRequests: [firstRecord],
        modelId: args.modelId,
      };
    }

    const rejected = !parsed.ok
      ? ["the response was not valid JSON"]
      : validated && !validated.ok
        ? validated.reasons
        : ["malformed report"];
    const second = await complete(args.body(rejected));
    const secondRecord = requestRecord("repair", second);
    if (!second.ok) {
      return failedDraft(args.modelId, {
        repairAttempted: true,
        error: { kind: second.kind, status: second.status, message: second.message },
        providerRequests: [firstRecord, secondRecord],
      });
    }
    const repaired = tryParse(second.payload.content);
    const repairedValidation = repaired.ok ? args.validate(repaired.value) : null;
    if (!repaired.ok || !repairedValidation?.ok) {
      return failedDraft(args.modelId, {
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
        providerRequests: [firstRecord, secondRecord],
      });
    }
    return {
      draftingFailed: false,
      repairAttempted: true,
      refusal: null,
      error: null,
      report: repairedValidation.report,
      usage: second.payload.usage,
      usageCost: second.payload.usageCost,
      providerRequests: [firstRecord, secondRecord],
      modelId: args.modelId,
    };
  }

  async function draftThesis(draftInput: {
    modelId: string;
    catalog: ModelCatalogEntry[];
    packet: ThesisPacket;
  }): Promise<DraftThesisResult> {
    const core = await draftJson({
      modelId: draftInput.modelId,
      catalog: draftInput.catalog,
      body: (rejected) =>
        thesisRequestBody({ modelId: draftInput.modelId, packet: draftInput.packet, rejected }),
      validate: (value) => validateThesisReport(value, draftInput.packet),
    });
    return { ...core, packet: draftInput.packet };
  }

  async function draftPickExplanation(draftInput: {
    modelId: string;
    catalog: ModelCatalogEntry[];
    packet: PickExplanationPacket;
  }): Promise<DraftPickExplanationResult> {
    const core = await draftJson({
      modelId: draftInput.modelId,
      catalog: draftInput.catalog,
      body: (rejected) =>
        pickExplanationRequestBody({
          modelId: draftInput.modelId,
          packet: draftInput.packet,
          rejected,
        }),
      validate: (value) => validatePickExplanation(value, draftInput.packet),
    });
    return { ...core, packet: draftInput.packet };
  }

  return {
    id: input.id,
    baseUrl,
    discoverModels,
    testModel,
    selectionStatus,
    draftThesis,
    draftPickExplanation,
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
