import type {
  PickExplanationEntry,
  PickExplanationFacts,
  PickExplanationPacket,
  PickExplanationReport,
  PickExplanationSideFacts,
  ThesisClaim,
} from "../providers/contracts.ts";
import type { EvidenceItem } from "../sources/contracts.ts";
import type { BoardMarket } from "./board-store.ts";
import type { ModelPickSide, StrengthGrade } from "./model-pick.ts";
import { forbiddenProbabilityKeys } from "./report-schema.ts";

const GRADES: readonly StrengthGrade[] = ["strong", "lean", "no edge"];
const DRIVER_COUNT = 4;

function sideFacts(
  side: ModelPickSide,
  game: { home: string; away: string },
): PickExplanationSideFacts {
  return {
    selection: side.selection,
    label:
      side.selection === "home"
        ? game.home
        : side.selection === "away"
          ? game.away
          : side.selection,
    pointLine: side.pointLine,
    americanOdds: side.americanOdds,
    modelWinProbability: side.probabilities.win,
    noVigProbability: side.noVigProbability,
    expectedValue: side.expectedValue,
  };
}

/**
 * The frozen picks, their numbers, drivers, evidence, and gaps. The signature has no lean
 * parameter, so the private lean cannot reach a drafter.
 */
export function buildPickExplanationPacket(input: {
  game: { home: string; away: string };
  markets: BoardMarket[];
  evidence: EvidenceItem[];
  gaps: string[];
}): PickExplanationPacket {
  const picks: PickExplanationFacts[] = [];
  for (const market of input.markets) {
    const pick = market.pick;
    if (!pick) continue;
    const { calculation } = pick;
    const picked = calculation.sides.find(
      (side) => side.selection === calculation.pickedSelection,
    )!;
    const other = calculation.sides.find((side) => side.selection !== calculation.pickedSelection)!;
    const part =
      market.market === "total" ? pick.forecast?.drivers?.total : pick.forecast?.drivers?.margin;
    picks.push({
      market: market.market,
      grade: calculation.grade,
      release: calculation.release,
      tieBreak: calculation.tieBreak,
      materialEvidenceMissing: calculation.materialEvidenceMissing,
      picked: sideFacts(picked, input.game),
      other: sideFacts(other, input.game),
      drivers: part
        ? [...part.contributions]
            .filter((item) => Math.abs(item.points) >= 0.005)
            .sort((left, right) => Math.abs(right.points) - Math.abs(left.points))
            .slice(0, DRIVER_COUNT)
            .map((item) => ({ feature: item.feature, points: item.points }))
        : [],
    });
  }
  return {
    game: { home: input.game.home, away: input.game.away },
    picks,
    items: input.evidence.map((item) => ({ ...item, facts: { ...item.facts } })),
    gaps: [...input.gaps],
  };
}

const RULES = [
  "Explain each frozen model pick in plain language as a JSON object. No markdown.",
  "The forecasting model already chose each side and the code already graded it. Copy side, grade, americanOdds, and pointLine exactly and never argue for a different side or grade.",
  "Use only the numbers supplied in picks. Do not add win, loss, push, or probability fields, and do not state a percentage, price, or line that is not supplied.",
  "Cite only evidence ids from the packet. Every claim cites at least one id.",
  "Give every pick at least one opposing claim and an otherSideCase: the strongest case for the other side, from supplied evidence only.",
  "Say that the forecasting model, not you, chose the side. List relevant packet gaps in missingInputs.",
  'Fields: picks: array with one entry per supplied pick, each {market: string, side: "home"|"away"|"over"|"under", grade: "strong"|"lean"|"no edge", americanOdds: number, pointLine: number|null, summary: string, otherSideCase: string, claims: array of {text: string, stance: "supporting"|"opposing", evidenceIds: array of strings}, missingInputs: array of strings}.',
].join(" ");

/** `rejected` holds the reasons the previous draft failed; when present, this is the repair request. */
export function pickExplanationRequestBody(input: {
  modelId: string;
  packet: PickExplanationPacket;
  rejected?: string[];
}): string {
  const evidence = input.packet.items.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    retrievedAt: item.retrievedAt,
    publishedAt: item.publishedAt,
    origin: item.origin,
    facts: item.facts,
    excerpt: item.excerpt,
  }));
  const instruction = input.rejected
    ? `${RULES} Your previous draft was rejected: ${input.rejected.join("; ")}. Return a corrected JSON object.`
    : RULES;
  return JSON.stringify({
    model: input.modelId,
    temperature: 0,
    max_tokens: 8000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: instruction },
      {
        role: "user",
        content: JSON.stringify({
          game: input.packet.game,
          picks: input.packet.picks,
          evidence,
          gaps: input.packet.gaps,
        }),
      },
    ],
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Every way the value differs from the report shape, for the repair request. */
export function explanationShapeProblems(value: unknown): string[] {
  if (!isRecord(value)) return ["The explanation must be a JSON object"];
  if (!Array.isArray(value.picks)) return ["picks must be an array"];
  const problems: string[] = [];
  value.picks.forEach((entry, index) => {
    const at = `picks[${index}]`;
    if (!isRecord(entry)) {
      problems.push(`${at} must be an object`);
      return;
    }
    for (const field of ["market", "side", "grade", "summary", "otherSideCase"]) {
      if (typeof entry[field] !== "string") problems.push(`${at}.${field} must be a string`);
    }
    if (typeof entry.americanOdds !== "number")
      problems.push(`${at}.americanOdds must be a number`);
    if (entry.pointLine !== null && typeof entry.pointLine !== "number") {
      problems.push(`${at}.pointLine must be a number or null`);
    }
    if (!stringArray(entry.missingInputs)) {
      problems.push(`${at}.missingInputs must be an array of strings`);
    }
    if (!Array.isArray(entry.claims)) {
      problems.push(`${at}.claims must be an array`);
      return;
    }
    entry.claims.forEach((claim, claimIndex) => {
      const where = `${at}.claims[${claimIndex}]`;
      if (!isRecord(claim)) {
        problems.push(`${where} must be an object`);
        return;
      }
      if (typeof claim.text !== "string") problems.push(`${where}.text must be a string`);
      if (claim.stance !== "supporting" && claim.stance !== "opposing") {
        problems.push(`${where}.stance must be "supporting" or "opposing"`);
      }
      if (!stringArray(claim.evidenceIds)) {
        problems.push(`${where}.evidenceIds must be an array of strings`);
      }
    });
  });
  return problems;
}

const NUMBER_TOLERANCE = 1e-6;
const PERCENTAGE = /(\d+(?:\.\d+)?)\s*(?:%|percent\b)/gi;
// A signed token such as -3.5, +130, or −110. A hyphen inside a word or date never matches.
const SIGNED = /(?<![\w.])([+\-−])(\d+(?:\.\d+)?)(?!\d)/g;

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function allSides(packet: PickExplanationPacket): PickExplanationSideFacts[] {
  return packet.picks.flatMap((pick) => [pick.picked, pick.other]);
}

function problemsInProse(
  entry: PickExplanationEntry,
  facts: PickExplanationFacts,
  packet: PickExplanationPacket,
): string[] {
  const prose = [
    entry.summary,
    entry.otherSideCase,
    ...entry.claims.map((claim) => claim.text),
    ...entry.missingInputs,
  ];
  const where = `${facts.market} explanation`;
  const reasons: string[] = [];
  const sides = allSides(packet);

  const suppliedPercentages = [
    ...sides.flatMap((side) => [side.modelWinProbability * 100, side.noVigProbability * 100]),
    ...packet.items.flatMap((item) =>
      Object.entries(item.facts)
        .filter(([key, value]) => key.endsWith("Percent") && typeof value === "number")
        .map(([, value]) => value as number),
    ),
  ];
  const invented = prose.flatMap((text) =>
    [...text.matchAll(PERCENTAGE)]
      .filter((match) => {
        const tolerance = match[1]!.includes(".") ? 0.05 : 0.5;
        return suppliedPercentages.every((value) => Math.abs(Number(match[1]) - value) > tolerance);
      })
      .map((match) => match[0]),
  );
  if (invented.length > 0) {
    reasons.push(
      `The ${where} states percentages the packet did not supply: ${invented.join(", ")}`,
    );
  }

  const suppliedNumbers = [
    ...sides.flatMap((side) => [side.americanOdds, side.expectedValue]),
    ...sides.flatMap((side) => (side.pointLine === null ? [] : [side.pointLine, -side.pointLine])),
  ];
  const strayNumbers = prose.flatMap((text) =>
    [...text.matchAll(SIGNED)]
      .filter((match) => {
        const value = Number(match[2]) * (match[1] === "+" ? 1 : -1);
        const tolerance = match[2]!.includes(".") ? 0.0051 : 0;
        return suppliedNumbers.every((known) => Math.abs(known - value) > tolerance);
      })
      .map((match) => `${match[1]}${match[2]}`),
  );
  if (strayNumbers.length > 0) {
    reasons.push(
      `The ${where} states numbers the packet did not supply: ${strayNumbers.join(", ")}`,
    );
  }

  for (const grade of GRADES.filter((item) => item !== facts.grade)) {
    const named = new RegExp(
      `\\b(?:graded|rated|grade(?:\\s+(?:is|of|as))?)\\s+(?:as\\s+)?${escaped(grade)}\\b|\\b${escaped(grade)}\\s+(?:grade|model\\s+pick)\\b`,
      "i",
    );
    if (prose.some((text) => named.test(text))) {
      reasons.push(`The ${where} names grade "${grade}" but the frozen grade is "${facts.grade}"`);
    }
  }

  const other = new RegExp(
    `\\b(?:pick|picks|picked|back|backs|take|takes|favou?rs?|recommends?|chooses?|chose)\\s+(?:is\\s+|:\\s*)?(?:the\\s+)?${escaped(facts.other.label)}\\b`,
    "i",
  );
  if (prose.some((text) => other.test(text))) {
    reasons.push(
      `The ${where} names ${facts.other.label} as the pick but the frozen side is ${facts.picked.label}`,
    );
  }
  return reasons;
}

export type PickExplanationValidation =
  | { ok: true; report: PickExplanationReport }
  | { ok: false; reasons: string[] };

/**
 * A drafter explains frozen picks. Structured side, grade, price, and line must equal the
 * frozen pick, and prose cannot add a percentage, price, or line, a different grade, or the
 * other side as the pick.
 */
export function validatePickExplanation(
  value: unknown,
  packet: PickExplanationPacket,
): PickExplanationValidation {
  const reasons: string[] = [];
  const probabilityKeys = forbiddenProbabilityKeys(value);
  if (probabilityKeys.length > 0) {
    reasons.push(`Model supplied a probability field: ${probabilityKeys.join(", ")}`);
  }
  const shape = explanationShapeProblems(value);
  if (shape.length > 0) return { ok: false, reasons: [...reasons, ...shape] };
  const entries = (value as { picks: PickExplanationEntry[] }).picks;
  const allowedIds = new Set(packet.items.map((item) => item.id));

  for (const facts of packet.picks) {
    const matching = entries.filter((entry) => entry.market === facts.market);
    if (matching.length !== 1) {
      reasons.push(`Expected exactly one ${facts.market} explanation, found ${matching.length}`);
      continue;
    }
    const entry = matching[0]!;
    if (entry.side !== facts.picked.selection) {
      reasons.push(
        `The ${facts.market} explanation names side "${entry.side}" but the frozen side is "${facts.picked.selection}"`,
      );
    }
    if (entry.grade !== facts.grade) {
      reasons.push(
        `The ${facts.market} explanation names grade "${entry.grade}" but the frozen grade is "${facts.grade}"`,
      );
    }
    if (Math.abs(entry.americanOdds - facts.picked.americanOdds) > NUMBER_TOLERANCE) {
      reasons.push(`The ${facts.market} americanOdds does not match the frozen pick`);
    }
    if (entry.pointLine !== facts.picked.pointLine) {
      reasons.push(`The ${facts.market} pointLine does not match the frozen pick`);
    }
    entry.claims.forEach((claim, index) => {
      if (claim.evidenceIds.length === 0) {
        reasons.push(`The ${facts.market} claim ${index + 1} cites no evidence`);
      }
      for (const id of claim.evidenceIds) {
        if (!allowedIds.has(id)) reasons.push(`Unknown evidence id ${id}`);
      }
    });
    if (!entry.claims.some((claim) => claim.stance === "opposing")) {
      reasons.push(`The ${facts.market} explanation has no opposing claim`);
    }
    if (entry.otherSideCase.trim() === "") {
      reasons.push(`The ${facts.market} explanation has no case for the other side`);
    }
    reasons.push(...problemsInProse(entry, facts, packet));
  }
  for (const entry of entries) {
    if (!packet.picks.some((facts) => facts.market === entry.market)) {
      reasons.push(`The explanation covers ${entry.market}, which has no frozen model pick`);
    }
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return {
    ok: true,
    report: {
      picks: packet.picks.map((facts) => {
        const entry = entries.find((item) => item.market === facts.market)!;
        return {
          market: facts.market,
          side: facts.picked.selection,
          grade: facts.grade,
          americanOdds: facts.picked.americanOdds,
          pointLine: facts.picked.pointLine,
          summary: entry.summary,
          otherSideCase: entry.otherSideCase,
          claims: entry.claims.map((claim): ThesisClaim => ({
            text: claim.text,
            stance: claim.stance,
            evidenceIds: [...claim.evidenceIds],
          })),
          missingInputs: [...entry.missingInputs],
        };
      }),
    },
  };
}
