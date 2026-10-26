import { createHash } from "node:crypto";
import { americanToDecimal, breakEven } from "#lib/domain/odds.ts";
import { OfferError, parseOffer, type OfferInput, type TieRule } from "#lib/domain/offer.ts";
import { buildThesisPacket, thesisRequestBody } from "./packet.ts";
import { redactText } from "./redact.ts";
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
import { noModel, type ModelSource, type RunModel } from "./model.ts";
import { decidePolicy } from "./policy.ts";
import { assembleEvidencePacket } from "../sources/packet.ts";
import { createManualEvidence } from "../sources/manual.ts";
import type { EvidenceItem, ScheduledGame, SourceTime } from "../sources/contracts.ts";
import { noSources, type EvidenceCollector, type MaterialGapKind } from "./evidence.ts";
import { coverMaterialGaps } from "./coverage.ts";

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
  /** Entered with the offer. Entry time is the run time. */
  manualEvidence?: ManualEvidenceInput[];
  /** Manual evidence from the run being refreshed, kept as it was entered. */
  carriedEvidence?: EvidenceItem[];
};

export type ManualEvidenceInput = {
  text: string;
  url: string;
  sourceTime: SourceTime;
  covers?: MaterialGapKind;
};

export type AnalysisDependencies = {
  store: ResearchStore;
  drafter?: ThesisDrafter;
  collect?: EvidenceCollector;
  model?: ModelSource;
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
    return { error: `Saving the run failed: ${redactText(message)}` };
  }
}

export async function runAnalysis(
  request: AnalysisRequest,
  {
    store,
    drafter = createFixtureDrafter(),
    collect = noSources,
    model = noModel,
  }: AnalysisDependencies,
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

  let manual: EvidenceItem[];
  try {
    manual = (request.manualEvidence ?? []).map((entry) =>
      createManualEvidence({
        text: entry.text,
        url: entry.url,
        sourceTime: entry.sourceTime,
        enteredAt: request.nowIso,
        ...(entry.covers ? { covers: entry.covers } : {}),
      }),
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid manual evidence" };
  }

  note("collecting evidence");
  const collected = await collect(request.game, request.nowIso);
  const coverage = coverMaterialGaps(
    collected.materialGaps,
    [...(request.carriedEvidence ?? []), ...manual],
    request.nowIso,
  );
  const packet = assembleEvidencePacket({
    game: request.game,
    decisionCutoff: request.nowIso,
    items: [
      scheduleEvidence(request.game, request.scheduleRetrievedAt ?? request.nowIso),
      ...collected.items,
      ...(request.carriedEvidence ?? []),
      ...manual,
    ],
    gaps: collected.gaps,
  });
  const conflictGaps = packet.conflicts.map(
    (conflict) => `Sources disagree on ${conflict.factKey}: ${conflict.itemIds.join(", ")}.`,
  );
  const late = packet.rejectedAfterCutoff;
  const gaps = [
    ...packet.gaps,
    ...coverage.notes,
    ...conflictGaps,
    ...(late.length > 0
      ? [
          `Excluded ${late.length} evidence item${late.length === 1 ? "" : "s"} dated after the decision cutoff: ${late
            .map((item) => item.excerpt ?? item.id)
            .join("; ")}`,
        ]
      : []),
  ];

  note("computing");
  const decimalOdds = americanToDecimal(offer.americanOdds);
  const decisiveBreakEven = breakEven(decimalOdds).decisive;
  let probabilityModel: RunModel;
  try {
    probabilityModel = await model(request.game, request.nowIso, offer);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    probabilityModel = {
      status: "unavailable",
      reason: `The model could not price this offer: ${redactText(message)}`,
    };
  }
  // Only an eligible model reaches the policy. Otherwise its numbers are recorded, not used.
  const eligible = probabilityModel.status === "computed" && probabilityModel.eligible;
  const policy = decidePolicy({
    offerValid: true,
    gameStarted: false,
    materialEvidenceMissing: coverage.remaining.length > 0 || conflictGaps.length > 0,
    manualCoverage: coverage.covered,
    releaseStatus: eligible ? "released-experimental" : "unreleased",
    releaseReason: probabilityModel.reason,
    probabilities:
      eligible && probabilityModel.status === "computed" ? probabilityModel.probabilities : null,
    uncertainty:
      eligible && probabilityModel.status === "computed"
        ? probabilityModel.uncertainty
        : { available: false, reason: "Not assessed." },
    decimalOdds,
  });
  const thesisPacket = buildThesisPacket({
    items: packet.items,
    gaps,
    decimalOdds,
    decisiveBreakEven,
    policy: {
      version: policy.policyVersion,
      conclusion: policy.conclusion,
      blockingReason: policy.blockingReason,
    },
  });
  const evidencePacketHash = createHash("sha256")
    .update(thesisRequestBody({ modelId: drafter.modelId, packet: thesisPacket }))
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
    gaps,
    policy,
    probabilityModel,
    provider: drafter.id,
    model: drafter.modelId,
    usage:
      drafted.usage || drafted.usageCost !== null
        ? {
            promptTokens: drafted.usage?.promptTokens ?? null,
            completionTokens: drafted.usage?.completionTokens ?? null,
            totalTokens: drafted.usage?.totalTokens ?? null,
            costUsd: drafted.usageCost,
          }
        : null,
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
