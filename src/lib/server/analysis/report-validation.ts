import type { ThesisPacket, ThesisReport } from "../providers/contracts.ts";
import { forbiddenProbabilityKeys, isThesisReportShape } from "./report-schema.ts";

const NUMBER_TOLERANCE = 1e-6;

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
  for (const claim of value.claims) {
    for (const id of claim.evidenceIds) {
      if (!allowed.has(id)) reasons.push(`Unknown evidence id ${id}`);
    }
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
