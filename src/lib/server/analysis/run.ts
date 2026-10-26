import { createHash, randomUUID } from "node:crypto";
import type { ManualEvidenceInput } from "./attempt.ts";
import { americanToDecimal, breakEven } from "#lib/domain/odds.ts";
import { OfferError, parseOffer, type OfferInput, type TieRule } from "#lib/domain/offer.ts";
import { buildThesisPacket, thesisRequestBody } from "./packet.ts";
import { redactText } from "./redact.ts";
import { validateThesisReport } from "./report-validation.ts";
import { createFixtureDrafter } from "./fixture-drafter.ts";
import { gameHasStarted } from "./games.ts";
import {
  progressStages,
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
import type { EvidenceItem, ScheduledGame } from "../sources/contracts.ts";
import { noSources, type EvidenceCollector } from "./evidence.ts";
import { coverMaterialGaps } from "./coverage.ts";

export type { ThesisDrafter };

export type AnalysisRequest = {
  /** Stable browser-generated identifier reused only when retrying this exact submission. */
  requestId?: string;
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

export type { ManualEvidenceInput } from "./attempt.ts";

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

export async function runAnalysis(
  request: AnalysisRequest,
  {
    store,
    drafter = createFixtureDrafter(),
    collect = noSources,
    model = noModel,
  }: AnalysisDependencies,
): Promise<AnalysisOutcome> {
  const requestId = request.requestId ?? randomUUID();
  const stages: ProgressStage[] = [];
  stages.push("checking inputs");
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
        ...(entry.team ? { team: entry.team } : {}),
      }),
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid manual evidence" };
  }
  const inputHash = createHash("sha256")
    .update(
      JSON.stringify({
        game: snapshot(request.game),
        parentId: request.parentId ?? null,
        cutoffAt: request.nowIso,
        offer,
        lean: leanOf(request),
        scheduleRetrievedAt: request.scheduleRetrievedAt ?? request.nowIso,
        manualEvidence: request.manualEvidence ?? [],
        carriedEvidence: request.carriedEvidence ?? [],
        drafter: { provider: drafter.id, modelId: drafter.modelId },
      }),
    )
    .digest("hex");
  const common = {
    request: {
      id: requestId,
      hash: inputHash,
      inputs: {
        scheduleRetrievedAt: request.scheduleRetrievedAt ?? request.nowIso,
        manualEvidence: (request.manualEvidence ?? []).map((entry) => ({
          text: entry.text,
          url: entry.url,
          sourceTime: entry.sourceTime,
          covers: entry.covers ?? null,
          team: entry.team ?? null,
        })),
        carriedEvidence: request.carriedEvidence ?? [],
        drafter: { provider: drafter.id, modelId: drafter.modelId },
      },
    },
    parentId: request.parentId ?? null,
    cutoffAt: request.nowIso,
    game: snapshot(request.game),
    offer,
    lean: leanOf(request),
    evidence: [],
    evidencePacketHash: "",
    gaps: [],
    policy: null,
    probabilityModel: null,
    provider: drafter.id,
    model: drafter.modelId,
    usage: null,
    report: null,
    renderedText: "",
    failureReason: null,
  };
  const begun = await store.beginAttempt({ ...common, status: "pending", stages });
  if (begun.kind === "conflict") return { ok: false, error: begun.error };
  if (begun.kind === "existing") {
    if (begun.run.status === "completed") return { ok: true, run: begun.run };
    const error =
      begun.run.status === "failed"
        ? (begun.run.failureReason ?? "This attempt failed. Start a new attempt to retry.")
        : "This attempt was already started and was not replayed. Start a new attempt to retry.";
    return { ok: false, error, run: begun.run };
  }

  let current = begun.run;
  const advance = async (stage: ProgressStage) => {
    if (!stages.includes(stage)) stages.push(stage);
    current = await store.updateAttempt({ ...current, status: "running", stages: [...stages] });
  };
  const failAttempt = async (reason: string): Promise<AnalysisOutcome> => {
    const failed = await store.saveRun({
      ...current,
      status: "failed",
      stages: [...stages],
      failureReason: redactText(reason),
      report: null,
      renderedText: "",
    });
    return { ok: false, error: redactText(reason), run: failed };
  };

  try {
    await advance("collecting evidence");
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
    await advance("computing");
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
    current = await store.updateAttempt({
      ...current,
      evidence: thesisPacket.items,
      gaps,
      policy,
      probabilityModel,
      evidencePacketHash,
    });
    await advance("drafting");
    const drafted = await drafter.draftThesis({
      modelId: drafter.modelId,
      catalog: [],
      packet: thesisPacket,
    });

    await advance("checking report");
    const checked = drafted.report ? validateThesisReport(drafted.report, thesisPacket) : null;
    const common = {
      ...current,
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
      const failed = await store.saveRun({
        ...common,
        status: "failed",
        stages: [...stages],
        report: null,
        renderedText: "",
        failureReason,
      });
      return { ok: false, error: failureReason, run: failed };
    }

    const renderedText = [
      checked.report.conclusion,
      checked.report.summary,
      ...checked.report.claims.map((claim) => `${claim.evidenceIds.join(", ")}: ${claim.text}`),
      ...checked.report.missingInputs,
      `American odds ${offer.americanOdds}`,
    ].join("\n");
    const run = await store.saveRun({
      ...common,
      status: "completed",
      stages: [...progressStages],
      report: checked.report,
      renderedText,
      failureReason: null,
    });
    return { ok: true, run };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return failAttempt(reason);
  }
}
