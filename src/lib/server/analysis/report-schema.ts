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

/** Every way the value differs from the report shape, naming the field, for the repair request. */
export function reportShapeProblems(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["The report must be a JSON object"];
  }
  const record = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const field of ["conclusion", "summary", "uncertainty"]) {
    if (typeof record[field] !== "string") problems.push(`${field} must be a string`);
  }
  for (const field of ["assumptions", "missingInputs", "changeConditions"]) {
    const items = record[field];
    if (!Array.isArray(items) || !items.every((item) => typeof item === "string")) {
      problems.push(`${field} must be an array of strings`);
    }
  }
  for (const field of ["decimalOdds", "decisiveBreakEven"]) {
    if (typeof record[field] !== "number") problems.push(`${field} must be a number`);
  }
  if (!Array.isArray(record.claims)) {
    problems.push("claims must be an array");
    return problems;
  }
  record.claims.forEach((claim, index) => {
    const at = `claims[${index}]`;
    if (!claim || typeof claim !== "object") {
      problems.push(`${at} must be an object`);
      return;
    }
    const row = claim as Record<string, unknown>;
    if (typeof row.text !== "string") problems.push(`${at}.text must be a string`);
    if (row.stance !== "supporting" && row.stance !== "opposing") {
      problems.push(
        `${at}.stance must be "supporting" or "opposing", not ${JSON.stringify(row.stance)}`,
      );
    }
    if (!Array.isArray(row.evidenceIds) || !row.evidenceIds.every((id) => typeof id === "string")) {
      problems.push(`${at}.evidenceIds must be an array of strings`);
    }
  });
  return problems;
}

export function isThesisReportShape(value: unknown): value is ThesisReport {
  return reportShapeProblems(value).length === 0;
}
