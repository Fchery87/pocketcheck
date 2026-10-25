import { createHash } from "node:crypto";
import { americanToDecimal, breakEven } from "#lib/domain/odds.ts";
import { OfferError, parseOffer, type OfferInput, type TieRule } from "#lib/domain/offer.ts";
import { buildThesisPacket, thesisRequestBody } from "./packet.ts";
import { validateThesisReport } from "./report-validation.ts";
import { createFixtureDrafter } from "./fixture-drafter.ts";
import { gameHasStarted } from "./games.ts";
import {
  progressStages,
  type NewRun,
  type PrivateLean,
  type ProgressStage,
  type ResearchRun,
  type ResearchStore,
  type RunGame,
} from "./store.ts";
import type { ThesisDrafter } from "../providers/contracts.ts";
import { decidePolicy } from "./policy.ts";
import { assembleEvidencePacket } from "../sources/packet.ts";
import type { EvidenceItem, ScheduledGame } from "../sources/contracts.ts";

export type { ThesisDrafter };

export type AnalysisRequest = {
  game: ScheduledGame;
  /** Decision cutoff for this run. Evidence after it is excluded. */
  nowIso: string;
  /** When the schedule file this game came from was retrieved. Defaults to the run time. */
  scheduleRetrievedAt?: string;
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

export type AnalysisDependencies = {
  store: ResearchStore;
  drafter?: ThesisDrafter;
};

export type AnalysisOutcome =
  | { ok: true; run: ResearchRun }
  | { ok: false; error: string; run?: ResearchRun };

function scheduleEvidence(game: ScheduledGame, retrievedAt: string): EvidenceItem {
  return {
    id: `schedule:${game.id}`,
    sourceId: "nflverse-schedule",
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

function snapshot(game: ScheduledGame): RunGame {
  return {
    id: game.id,
    season: game.season,
    week: game.week,
    home: game.home,
    away: game.away,
    kickoff: game.kickoff,
    venue: game.venue.name,
  };
}

function leanOf(request: AnalysisRequest): PrivateLean | null {
  const text = request.lean?.trim() ?? "";
  const rationale = request.rationale?.trim() ?? "";
  if (!text && !rationale) return null;
  return { text, rationale };
}

async function save(store: ResearchStore, run: NewRun): Promise<ResearchRun | { error: string }> {
  try {
    return await store.saveRun(run);
  } catch (error) {
    const message = error instanceof Error ? error.message : "save failed";
    return {
      error: `Saving the run failed: ${message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]")}`,
    };
  }
}

export async function runAnalysis(
  request: AnalysisRequest,
  { store, drafter = createFixtureDrafter() }: AnalysisDependencies,
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
    decisionCutoff: request.nowIso,
    items: [scheduleEvidence(request.game, request.scheduleRetrievedAt ?? request.nowIso)],
    gaps: ["Injury report was not collected.", "Weather was not collected."],
  });

  note("computing");
  const decimalOdds = americanToDecimal(offer.americanOdds);
  const decisiveBreakEven = breakEven(decimalOdds).decisive;
  const policy = decidePolicy({
    offerValid: true,
    gameStarted: false,
    materialEvidenceMissing: packet.gaps.length > 0,
    releaseStatus: "unreleased",
    probabilities: null,
    decimalOdds,
  });
  const thesisPacket = buildThesisPacket({
    items: packet.items,
    decimalOdds,
    decisiveBreakEven,
    policy: {
      version: policy.policyVersion,
      conclusion: policy.conclusion,
      blockingReason: policy.blockingReason,
    },
  });
  const evidencePacketHash = createHash("sha256")
    .update(thesisRequestBody({ modelId: drafter.modelId, packet: thesisPacket, repair: false }))
    .digest("hex");

  note("drafting");
  const drafted = await drafter.draftThesis({
    modelId: drafter.modelId,
    catalog: [],
    packet: thesisPacket,
  });

  note("checking report");
  const checked = drafted.report ? validateThesisReport(drafted.report, thesisPacket) : null;
  const common = {
    parentId: request.parentId ?? null,
    cutoffAt: request.nowIso,
    game: snapshot(request.game),
    offer,
    lean: leanOf(request),
    evidence: thesisPacket.items,
    evidencePacketHash,
    policy,
    provider: drafter.id,
    model: drafter.modelId,
  };

  if (!checked?.ok) {
    const failureReason =
      checked?.reasons.join("; ") ?? drafted.error?.message ?? "Report check failed";
    const failed = await save(store, {
      ...common,
      status: "failed",
      stages,
      report: null,
      renderedText: "",
      failureReason,
    });
    if ("error" in failed) return { ok: false, error: `${failureReason}. ${failed.error}` };
    return { ok: false, error: failureReason, run: failed };
  }

  const renderedText = [
    checked.report.conclusion,
    checked.report.summary,
    ...checked.report.claims.map((claim) => `${claim.evidenceIds.join(", ")}: ${claim.text}`),
    ...checked.report.missingInputs,
    `American odds ${offer.americanOdds}`,
  ].join("\n");

  const run = await save(store, {
    ...common,
    status: "completed",
    stages: progressStages.filter((stage) => stages.includes(stage)),
    report: checked.report,
    renderedText,
    failureReason: null,
  });
  if ("error" in run) return { ok: false, error: run.error };
  return { ok: true, run };
}
