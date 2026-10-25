import type { ThesisPacket, ThesisReport } from "../providers/contracts.ts";
import { forbiddenProbabilityKeys, isThesisReportShape } from "./report-schema.ts";

const NUMBER_TOLERANCE = 1e-6;
// "62%", "62.5 %", "70 percent".
const PERCENTAGE = /(\d+(?:\.\d+)?)\s*(?:%|percent\b)/gi;
// A restated break-even may be rounded to one decimal place.
const PERCENT_ROUNDING = 0.05;

/** Percentages in the report's prose that the packet did not supply. */
function inventedPercentages(report: ThesisReport, packet: ThesisPacket): string[] {
  const supplied = packet.decisiveBreakEven * 100;
  const prose = [
    report.summary,
    report.uncertainty,
    ...report.claims.map((claim) => claim.text),
    ...report.assumptions,
    ...report.missingInputs,
    ...report.changeConditions,
  ];
  return prose.flatMap((text) =>
    [...text.matchAll(PERCENTAGE)]
      .filter((match) => Math.abs(Number(match[1]) - supplied) > PERCENT_ROUNDING)
      .map((match) => match[0]),
  );
}

export type ReportValidation =
  | { ok: true; report: ThesisReport }
  | { ok: false; reasons: string[] };

export function validateThesisReport(value: unknown, packet: ThesisPacket): ReportValidation {
  const reasons: string[] = [];
  const probabilityKeys = forbiddenProbabilityKeys(value);
  if (probabilityKeys.length > 0) {
    reasons.push(`Model supplied a probability field: ${probabilityKeys.join(", ")}`);
  }
  if (!isThesisReportShape(value)) {
    reasons.push("Malformed report");
    return { ok: false, reasons };
  }
  const allowed = new Set(packet.items.map((item) => item.id));
  value.claims.forEach((claim, index) => {
    if (claim.evidenceIds.length === 0) reasons.push(`Claim ${index + 1} cites no evidence`);
    for (const id of claim.evidenceIds) {
      if (!allowed.has(id)) reasons.push(`Unknown evidence id ${id}`);
    }
  });
  const stances = new Set(value.claims.map((claim) => claim.stance));
  if (stances.has("supporting") && !stances.has("opposing")) {
    reasons.push("Report has supporting claims but no opposing claim");
  }
  const percentages = inventedPercentages(value, packet);
  if (percentages.length > 0) {
    reasons.push(
      `Report prose states percentages the packet did not supply: ${percentages.join(", ")}`,
    );
  }
  if (Math.abs(value.decimalOdds - packet.decimalOdds) > NUMBER_TOLERANCE) {
    reasons.push("decimalOdds does not match the supplied value");
  }
  if (Math.abs(value.decisiveBreakEven - packet.decisiveBreakEven) > NUMBER_TOLERANCE) {
    reasons.push("decisiveBreakEven does not match the supplied value");
  }
  if (value.conclusion !== packet.policy.conclusion) {
    reasons.push(
      `Report conclusion "${value.conclusion}" disagrees with the policy result "${packet.policy.conclusion}"`,
    );
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    report: {
      conclusion: value.conclusion,
      summary: value.summary,
      claims: value.claims.map((claim) => ({
        text: claim.text,
        stance: claim.stance,
        evidenceIds: [...claim.evidenceIds],
      })),
      assumptions: [...value.assumptions],
      uncertainty: value.uncertainty,
      missingInputs: [...value.missingInputs],
      changeConditions: [...value.changeConditions],
      decimalOdds: packet.decimalOdds,
      decisiveBreakEven: packet.decisiveBreakEven,
    },
  };
}
