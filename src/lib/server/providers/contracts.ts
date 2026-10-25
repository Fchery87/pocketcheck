import type { EvidenceItem } from "../sources/contracts.ts";

export type ProviderId = "theclawbay" | "deepseek";

export type RawCatalogModel = {
  id: string;
  object?: string;
  /** Present only when the provider declares it, as DeepSeek does. */
  outputModalities?: string[];
};

/**
 * How we know a model can draft a thesis: the catalog declares text output, or a test request
 * returned JSON. Untested models stay visible but cannot draft.
 */
export type CapabilityStatus = "declared" | "tested" | "untested" | "unsupported";

export type ModelCatalogEntry = {
  id: string;
  object: string;
  compatible: boolean;
  reason: string | null;
  capability: CapabilityStatus;
};

export type ModelCatalog = {
  provider: ProviderId;
  baseUrl: string;
  retrievedAt: string;
  entries: ModelCatalogEntry[];
};

export type ThesisCalculations = {
  decimalOdds: number;
  decisiveBreakEven: number;
};

/** The application policy result. The drafter explains it and cannot change it. */
export type PacketPolicy = {
  version: string;
  conclusion: string;
  blockingReason: string | null;
};

export type ThesisPacket = ThesisCalculations & {
  items: EvidenceItem[];
  /** Missing evidence and caveats the report must acknowledge. */
  gaps: string[];
  policy: PacketPolicy;
};

export type ThesisClaim = {
  text: string;
  stance: "supporting" | "opposing";
  evidenceIds: string[];
};

export type ThesisReport = ThesisCalculations & {
  conclusion: string;
  summary: string;
  claims: ThesisClaim[];
  assumptions: string[];
  uncertainty: string;
  missingInputs: string[];
  changeConditions: string[];
};

export type UsageRecord = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

export type ProviderErrorKind = "auth" | "rate_limit" | "timeout" | "transport" | "invalid_report";

/** A failed provider request. The message never contains the API key. */
// Plain fields, not parameter properties: scripts load this under Node's type stripper.
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status: number | null;

  constructor(kind: ProviderErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "ProviderError";
    this.kind = kind;
    this.status = status;
  }
}

export type ModelTest = { ok: boolean; reason: string | null; testedAt: string };

export type DraftThesisResult = {
  draftingFailed: boolean;
  repairAttempted: boolean;
  refusal: "removed" | "incompatible" | null;
  error: { kind: ProviderErrorKind; status: number | null; message: string } | null;
  report: ThesisReport | null;
  packet: ThesisPacket;
  usage: UsageRecord | null;
  usageCost: number | null;
  modelId: string;
};

export type ThesisProvider = {
  id: ProviderId;
  baseUrl: string;
  /** Throws ProviderError when the catalog cannot be read. */
  discoverModels: () => Promise<ModelCatalog>;
  /** One small JSON-mode request, to establish capability the catalog does not declare. */
  testModel: (modelId: string) => Promise<ModelTest>;
  selectionStatus: (
    modelId: string,
    entries: ModelCatalogEntry[],
  ) => { status: "available" | "removed" | "incompatible"; modelId: string; reason?: string };
  draftThesis: (input: {
    modelId: string;
    catalog: ModelCatalogEntry[];
    packet: ThesisPacket;
  }) => Promise<DraftThesisResult>;
};

/** What a research run needs from whatever drafts its thesis, including the fixture drafter. */
export type ThesisDrafter = {
  id: string;
  modelId: string;
  draftThesis: ThesisProvider["draftThesis"];
};

export type ProviderOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => string;
  /** Per-request limit. Defaults to 15 seconds for the catalog and 120 for drafting. */
  timeoutMs?: number;
};

export const INCOMPATIBLE_REASON = "not a text thesis model";
export const UNTESTED_REASON = "Capability is not declared. Test it from Settings before drafting.";

const NON_TEXT_OBJECTS = new Set(["image", "embedding", "audio"]);

export function classifyCatalogModel(raw: RawCatalogModel): ModelCatalogEntry {
  const object = raw.object ?? "model";
  const base = { id: raw.id, object };
  if (raw.outputModalities) {
    return raw.outputModalities.includes("text")
      ? { ...base, compatible: true, reason: null, capability: "declared" }
      : {
          ...base,
          compatible: false,
          reason: "declares no text output",
          capability: "unsupported",
        };
  }
  // The name is used only to exclude obvious non-text models, never to admit one.
  const lowered = `${raw.id} ${object}`.toLowerCase();
  const nonText =
    NON_TEXT_OBJECTS.has(object.toLowerCase()) ||
    ["embed", "image", "audio"].some((word) => lowered.includes(word));
  return nonText
    ? { ...base, compatible: false, reason: INCOMPATIBLE_REASON, capability: "unsupported" }
    : { ...base, compatible: false, reason: UNTESTED_REASON, capability: "untested" };
}

/** Apply saved test results to entries whose capability the catalog does not declare. */
export function applyModelTests(
  entries: ModelCatalogEntry[],
  tests: Record<string, ModelTest>,
): ModelCatalogEntry[] {
  return entries.map((entry) => {
    const test = tests[entry.id];
    if (entry.capability !== "untested" || !test) return entry;
    return test.ok
      ? { ...entry, compatible: true, reason: null, capability: "tested" }
      : { ...entry, reason: `Test failed: ${test.reason ?? "unknown"}` };
  });
}

export function parseCatalogPayload(body: unknown): RawCatalogModel[] {
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const models: RawCatalogModel[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { id?: unknown; object?: unknown; output_modalities?: unknown };
    if (typeof row.id !== "string" || row.id.length === 0) continue;
    const modalities = Array.isArray(row.output_modalities)
      ? row.output_modalities.filter((value): value is string => typeof value === "string")
      : undefined;
    models.push({
      id: row.id,
      object: typeof row.object === "string" ? row.object : "model",
      ...(modalities ? { outputModalities: modalities } : {}),
    });
  }
  return models;
}
