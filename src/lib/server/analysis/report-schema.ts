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

export function forbiddenProbabilityKeys(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.keys(value as Record<string, unknown>).filter((key) => probabilityKey.test(key));
}

export function isThesisReportShape(value: unknown): value is ThesisReport {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.conclusion !== "string") return false;
  if (typeof record.summary !== "string") return false;
  if (typeof record.uncertainty !== "string") return false;
  if (!Array.isArray(record.assumptions) || !record.assumptions.every((item) => typeof item === "string")) {
    return false;
  }
  if (!Array.isArray(record.missingInputs) || !record.missingInputs.every((item) => typeof item === "string")) {
    return false;
  }
  if (
    !Array.isArray(record.changeConditions) ||
    !record.changeConditions.every((item) => typeof item === "string")
  ) {
    return false;
  }
  if (typeof record.decimalOdds !== "number" || typeof record.decisiveBreakEven !== "number") return false;
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
