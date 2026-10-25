import type { EvidenceItem } from "../sources/contracts.ts";

export type ProviderId = "theclawbay" | "deepseek";

export type RawCatalogModel = {
  id: string;
  object?: string;
};

export type ModelCatalogEntry = {
  id: string;
  object: string;
  compatible: boolean;
  reason: string | null;
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

export type ProviderErrorKind = "auth" | "rate_limit" | "transport" | "invalid_report";

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
  discoverModels: () => Promise<ModelCatalog>;
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
};

export const INCOMPATIBLE_REASON = "not a text thesis model";

const NON_TEXT_OBJECTS = new Set(["image", "embedding", "audio"]);

export function classifyCatalogModel(raw: RawCatalogModel): ModelCatalogEntry {
  const object = raw.object ?? "model";
  const id = raw.id;
  const lowered = `${id} ${object}`.toLowerCase();
  const incompatible =
    NON_TEXT_OBJECTS.has(object.toLowerCase()) ||
    lowered.includes("embed") ||
    lowered.includes("image") ||
    lowered.includes("audio");
  return {
    id,
    object,
    compatible: !incompatible,
    reason: incompatible ? INCOMPATIBLE_REASON : null,
  };
}

export function parseCatalogPayload(body: unknown): RawCatalogModel[] {
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const models: RawCatalogModel[] = [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== "string" || id.length === 0) continue;
    const object = (entry as { object?: unknown }).object;
    models.push({ id, object: typeof object === "string" ? object : "model" });
  }
  return models;
}
