import { americanToDecimal, breakEven } from "#lib/domain/odds.ts";
import { OfferError, parseOffer, type OfferInput, type TieRule } from "#lib/domain/offer.ts";
import { buildThesisPacket, thesisRequestBody } from "./packet.ts";
import { validateThesisReport } from "./report-validation.ts";
import { createFixtureDrafter } from "./fixture-drafter.ts";
import { gameHasStarted } from "./games.ts";
import {
  progressStages,
  researchJournal,
  type PrivateLean,
  type ProgressStage,
  type ResearchRun,
} from "./memory-journal.ts";
import type { ThesisProvider } from "../providers/contracts.ts";
import { assembleEvidencePacket } from "../sources/packet.ts";
import type { EvidenceItem, ScheduledGame } from "../sources/contracts.ts";

export type AnalysisRequest = {
  game: ScheduledGame;
  nowIso: string;
  sportsbook: string;
  market: OfferInput["market"];
  selection: OfferInput["selection"];
  pointLine?: number;
  americanOdds: number;
  observedAt: string;
  tieRule?: TieRule;
  lean?: string;
  rationale?: string;
  parentId?: string | null;
};

export type AnalysisOutcome =
  | { ok: true; run: ResearchRun }
  | { ok: false; error: string; run?: ResearchRun };

function scheduleEvidence(game: ScheduledGame, retrievedAt: string): EvidenceItem {
  return {
    id: `schedule:${game.id}`,
    sourceId: "nflverse-fixture",
    url: null,
    retrievedAt,
    publishedAt: "unknown",
    origin: "automatic",
    facts: {
      home: game.home,
      away: game.away,
      kickoff: game.kickoff,
      venue: game.venue.name,
    },
    excerpt: `${game.away} at ${game.home}, ${game.venue.name}`,
    checksum: null,
    factKey: `schedule:${game.id}`,
  };
}

function leanOf(request: AnalysisRequest): PrivateLean | null {
  const text = request.lean?.trim() ?? "";
  const rationale = request.rationale?.trim() ?? "";
  if (!text && !rationale) return null;
  return { text, rationale };
}

export async function runAnalysis(
  request: AnalysisRequest,
  drafter: Pick<ThesisProvider, "draftThesis"> = createFixtureDrafter(),
): Promise<AnalysisOutcome> {
  const stages: ProgressStage[] = [];
  const note = (stage: ProgressStage) => {
    stages.push(stage);
  };

  note("checking inputs");
  if (gameHasStarted(request.game, request.nowIso)) {
    return { ok: false, error: "The game has already started" };
  }

  let offer;
  try {
    offer = parseOffer({
      gameId: request.game.id,
      sportsbook: request.sportsbook,
      market: request.market,
      selection: request.selection,
      pointLine: request.pointLine,
      americanOdds: request.americanOdds,
      observedAt: request.observedAt,
      kickoffAt: request.game.kickoff,
      rules: {
        period: "full-game",
        overtime: "included",
        tie: request.market === "moneyline" ? request.tieRule : undefined,
      },
    });
  } catch (error) {
    const message = error instanceof OfferError ? error.message : "Invalid offer";
    return { ok: false, error: message };
  }

  note("collecting evidence");
  const packet = assembleEvidencePacket({
    game: request.game,
    decisionCutoff: request.observedAt,
    items: [scheduleEvidence(request.game, request.observedAt)],
    gaps: ["Injury report was not collected.", "Weather was not collected."],
  });

  note("computing");
  const decimalOdds = americanToDecimal(offer.americanOdds);
  const decisiveBreakEven = breakEven(decimalOdds).decisive;
  const thesisPacket = buildThesisPacket({
    items: packet.items,
    decimalOdds,
    decisiveBreakEven,
    userLean: request.lean,
    userRationale: request.rationale,
  });
  const evidencePacketSent = thesisRequestBody({
    modelId: "fixture-drafter",
    packet: thesisPacket,
    repair: false,
  });
  if (request.lean && evidencePacketSent.includes(request.lean)) {
    throw new Error("Private lean leaked into the evidence packet");
  }

  note("drafting");
  const drafted = await drafter.draftThesis({
    modelId: "fixture-drafter",
    catalog: [],
    packet: thesisPacket,
  });

  note("checking report");
  const checked = drafted.report ? validateThesisReport(drafted.report, thesisPacket) : null;
  if (!checked?.ok) {
    const failed = researchJournal.saveRun({
      parentId: request.parentId ?? null,
      status: "failed",
      stages,
      game: request.game,
      offer,
      lean: leanOf(request),
      evidencePacketSent,
      report: null,
      renderedText: "",
      failureReason: checked?.reasons.join("; ") ?? drafted.error?.message ?? "Report check failed",
    });
    return { ok: false, error: failed.failureReason ?? "Report check failed", run: failed };
  }

  const renderedText = [
    checked.report.conclusion,
    checked.report.summary,
    ...checked.report.claims.map((claim) => `${claim.evidenceIds.join(", ")}: ${claim.text}`),
    ...checked.report.missingInputs,
    `American odds ${offer.americanOdds}`,
  ].join("\n");

  const run = researchJournal.saveRun({
    parentId: request.parentId ?? null,
    status: "completed",
    stages: progressStages.filter((stage) => stages.includes(stage)),
    game: request.game,
    offer,
    lean: leanOf(request),
    evidencePacketSent,
    report: checked.report,
    renderedText,
    failureReason: null,
  });
  return { ok: true, run };
}
