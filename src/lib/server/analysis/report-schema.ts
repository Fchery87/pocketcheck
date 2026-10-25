import type { ThesisReport } from "../providers/contracts.ts";

export const thesisReportFields = [
  "conclusion",
  "summary",
  "claims",
  "assumptions",
  "uncertainty",
  "missingInputs",
  "changeConditions",
  "decimalOdds",
  "decisiveBreakEven",
] as const;

export type ThesisReportField = (typeof thesisReportFields)[number];

const probabilityKey = /probabilit/i;

/** Paths of every probability-named key, at any depth, such as `claims[0].coverProbability`. */
export function forbiddenProbabilityKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => forbiddenProbabilityKeys(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    const here = path ? `${path}.${key}` : key;
    return [...(probabilityKey.test(key) ? [here] : []), ...forbiddenProbabilityKeys(item, here)];
  });
}

export function isThesisReportShape(value: unknown): value is ThesisReport {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.conclusion !== "string") return false;
  if (typeof record.summary !== "string") return false;
  if (typeof record.uncertainty !== "string") return false;
  if (
    !Array.isArray(record.assumptions) ||
    !record.assumptions.every((item) => typeof item === "string")
  ) {
    return false;
  }
  if (
    !Array.isArray(record.missingInputs) ||
    !record.missingInputs.every((item) => typeof item === "string")
  ) {
    return false;
  }
  if (
    !Array.isArray(record.changeConditions) ||
    !record.changeConditions.every((item) => typeof item === "string")
  ) {
    return false;
  }
  if (typeof record.decimalOdds !== "number" || typeof record.decisiveBreakEven !== "number")
    return false;
  if (!Array.isArray(record.claims)) return false;
  return record.claims.every((claim) => {
    if (!claim || typeof claim !== "object") return false;
    const row = claim as Record<string, unknown>;
    return (
      typeof row.text === "string" &&
      (row.stance === "supporting" || row.stance === "opposing") &&
      Array.isArray(row.evidenceIds) &&
      row.evidenceIds.every((id) => typeof id === "string")
    );
  });
}
