import type { ThesisClaim, ThesisPacket, ThesisReport } from "../providers/contracts.ts";
import {
  forbiddenProbabilityKeys,
  isThesisReportShape,
  reportShapeProblems,
} from "./report-schema.ts";

const NUMBER_TOLERANCE = 1e-6;
// "62%", "62.5 %", "70 percent".
const PERCENTAGE = /(\d+(?:\.\d+)?)\s*(?:%|percent\b)/gi;
// A restated break-even may be rounded to one decimal place.
const PERCENT_ROUNDING = 0.05;

/** The break-even, plus any evidence fact named `...Percent`, such as a precipitation chance. */
function suppliedPercentages(packet: ThesisPacket): number[] {
  const fromEvidence = packet.items.flatMap((item) =>
    Object.entries(item.facts)
      .filter(([key, value]) => key.endsWith("Percent") && typeof value === "number")
      .map(([, value]) => value as number),
  );
  return [packet.decisiveBreakEven * 100, ...fromEvidence];
}

/** Percentages in the report's prose that the packet did not supply. */
function inventedPercentages(report: ThesisReport, packet: ThesisPacket): string[] {
  const supplied = suppliedPercentages(packet);
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
      .filter((match) =>
        supplied.every((value) => Math.abs(Number(match[1]) - value) > PERCENT_ROUNDING),
      )
      .map((match) => match[0]),
  );
}

export type ReportValidation =
  | { ok: true; report: ThesisReport }
  | { ok: false; reasons: string[] };

function researchFacts(packet: ThesisPacket): Record<string, string | null> {
  return {
    "offer.americanOdds": `American odds ${packet.offer.americanOdds}`,
    "offer.pointLine":
      packet.offer.pointLine === null ? null : `Point line ${packet.offer.pointLine}`,
    decimalOdds: `Decimal odds ${packet.decimalOdds}`,
    decisiveBreakEven: `Decisive break-even ${packet.decisiveBreakEven}`,
  };
}

export function renderResearchClaim(claim: ThesisClaim, packet: ThesisPacket): string {
  const facts = researchFacts(packet);
  return [claim.text, ...(claim.factReferences ?? []).map((key) => facts[key])]
    .filter((text) => text !== null)
    .join("\n");
}

export function validateThesisReport(value: unknown, packet: ThesisPacket): ReportValidation {
  const reasons: string[] = [];
  const probabilityKeys = forbiddenProbabilityKeys(value);
  if (probabilityKeys.length > 0) {
    reasons.push(`Model supplied a probability field: ${probabilityKeys.join(", ")}`);
  }
  if (!isThesisReportShape(value)) {
    reasons.push(...reportShapeProblems(value));
    return { ok: false, reasons };
  }
  const allowed = new Set(packet.items.map((item) => item.id));
  const gaps = new Set(packet.requiredGaps.map((gap) => gap.id));
  const facts = researchFacts(packet);
  value.claims.forEach((claim, index) => {
    if (claim.evidenceIds.length === 0) reasons.push(`Claim ${index + 1} cites no evidence`);
    for (const id of claim.evidenceIds) {
      if (!allowed.has(id)) reasons.push(`Unknown evidence id ${id}`);
    }
    for (const id of claim.gapIds ?? []) {
      if (!gaps.has(id)) reasons.push(`Unknown gap id ${id}`);
    }
    for (const key of claim.factReferences ?? []) {
      if (!Object.hasOwn(facts, key) || facts[key] === null) {
        reasons.push(`Unavailable research fact reference ${key}`);
      }
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
      ...(value.claims.some((claim) => claim.factReferences?.length)
        ? { rendererVersion: 1 as const }
        : {}),
      conclusion: value.conclusion,
      summary: value.summary,
      claims: value.claims.map((claim) => ({
        text: claim.text,
        stance: claim.stance,
        evidenceIds: [...claim.evidenceIds],
        ...(claim.gapIds ? { gapIds: [...claim.gapIds] } : {}),
        ...(claim.factReferences ? { factReferences: [...claim.factReferences] } : {}),
        ...(claim.factReferences?.length
          ? { renderedText: renderResearchClaim(claim, packet) }
          : {}),
      })),
      assumptions: [...value.assumptions],
      uncertainty: value.uncertainty,
      missingInputs: [...new Set([...packet.gaps, ...value.missingInputs])],
      changeConditions: [...value.changeConditions],
      decimalOdds: packet.decimalOdds,
      decisiveBreakEven: packet.decisiveBreakEven,
    },
  };
}
