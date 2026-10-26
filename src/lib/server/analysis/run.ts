import { createHash, randomUUID } from "node:crypto";
import type { ManualEvidenceInput } from "./attempt.ts";
import { americanToDecimal, breakEven } from "#lib/domain/odds.ts";
import {
  OfferError,
  parseOffer,
  type Offer,
  type OfferInput,
  type TieRule,
} from "#lib/domain/offer.ts";
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
import type {
  DraftThesisResult,
  ProviderRequestRecord,
  ThesisDrafter,
  ThesisReport,
} from "../providers/contracts.ts";
import type { RunUsage } from "./store.ts";
import { noModel, type ModelSource, type RunModel } from "./model.ts";
import type { SavedForecast } from "./forecast-record.ts";
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

export type ForecastSource = (
  game: ScheduledGame,
  cutoffIso: string,
  offer: Offer,
  model: RunModel,
) => Promise<SavedForecast | null>;

export type AnalysisDependencies = {
  store: ResearchStore;
  drafter?: ThesisDrafter;
  collect?: EvidenceCollector;
  model?: ModelSource;
  forecast?: ForecastSource;
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

function durableDraft(run: ResearchRun): ProviderRequestRecord | null {
  if (run.providerOutcomeAmbiguous) return null;
  const completed = run.providerRequests.filter(
    (item) => item.outcome === "completed" && item.response && typeof item.response === "object",
  );
  const repair = [...completed].reverse().find((item) => item.role === "repair");
  return repair ?? completed.at(-1) ?? null;
}

async function finalizeFromDurable(
  store: ResearchStore,
  current: ResearchRun,
  durable: ProviderRequestRecord,
): Promise<AnalysisOutcome> {
  const report = durable.response as ThesisReport;
  const checked = validateThesisReport(report, {
    items: current.evidence,
    gaps: current.gaps,
    decimalOdds: report.decimalOdds,
    decisiveBreakEven: report.decisiveBreakEven,
    policy: {
      version: current.policy?.policyVersion ?? "unknown",
      conclusion: current.policy?.conclusion ?? report.conclusion,
      blockingReason: current.policy?.blockingReason ?? null,
    },
  });
  if (!checked.ok) {
    const failed = await store.saveRun({
      ...current,
      status: "failed",
      report: null,
      renderedText: "",
      failureReason: checked.reasons.join("; "),
    });
    return { ok: false, error: checked.reasons.join("; "), run: failed };
  }
  const renderedText = [
    checked.report.conclusion,
    checked.report.summary,
    ...checked.report.claims.map((claim) => `${claim.evidenceIds.join(", ")}: ${claim.text}`),
    ...checked.report.missingInputs,
    `American odds ${current.offer.americanOdds}`,
  ].join("\n");
  const run = await store.saveRun({
    ...current,
    status: "completed",
    stages: [...progressStages],
    report: checked.report,
    renderedText,
    failureReason: null,
  });
  return { ok: true, run };
}

function providerRequestsOf(drafted: DraftThesisResult): ProviderRequestRecord[] {
  if (drafted.providerRequests) return drafted.providerRequests;
  if (!drafted.usage && drafted.usageCost === null) return [];
  return [
    {
      requestId: "legacy-draft",
      role: drafted.repairAttempted ? "repair" : "draft",
      outcome: "completed",
      response: drafted.report,
      promptTokens: drafted.usage?.promptTokens ?? null,
      completionTokens: drafted.usage?.completionTokens ?? null,
      totalTokens: drafted.usage?.totalTokens ?? null,
      costUsd: drafted.usageCost,
      costKnown: drafted.usageCost !== null,
    },
  ];
}

function sumKnown(values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null;
  return values.reduce((total, value) => total + (value ?? 0), 0);
}

/** Totals every known request. A missing field stays unknown and marks the total partial. */
export function combineProviderUsage(requests: ProviderRequestRecord[]): RunUsage | null {
  if (requests.length === 0) return null;
  const costKnown = requests.every((item) => item.costKnown);
  const promptTokens = sumKnown(requests.map((item) => item.promptTokens));
  const completionTokens = sumKnown(requests.map((item) => item.completionTokens));
  const totalTokens = sumKnown(requests.map((item) => item.totalTokens));
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd: costKnown ? requests.reduce((total, item) => total + (item.costUsd ?? 0), 0) : null,
    partial:
      !costKnown || promptTokens === null || completionTokens === null || totalTokens === null,
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
    forecast,
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
    forecast: null,
    provider: drafter.id,
    model: drafter.modelId,
    usage: null,
    providerRequests: [],
    providerOutcomeAmbiguous: false,
    report: null,
    renderedText: "",
    failureReason: null,
  };
  const begun = await store.beginAttempt({ ...common, status: "pending", stages });
  if (begun.kind === "conflict") return { ok: false, error: begun.error };
  if (begun.kind === "existing") {
    if (begun.run.status === "completed") return { ok: true, run: begun.run };
    const durable = durableDraft(begun.run);
    if (durable) return finalizeFromDurable(store, begun.run, durable);
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
    const forecastRecord = forecast
      ? await forecast(request.game, request.nowIso, offer, probabilityModel)
      : null;
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
      forecast: forecastRecord,
      evidencePacketHash,
    });
    await advance("drafting");
    const drafted = await drafter.draftThesis({
      modelId: drafter.modelId,
      catalog: [],
      packet: thesisPacket,
    });

    const providerRequests = providerRequestsOf(drafted);
    current = await store.updateAttempt({
      ...current,
      providerRequests,
      providerOutcomeAmbiguous: providerRequests.some((item) => item.outcome === "ambiguous"),
      usage: combineProviderUsage(providerRequests),
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
      forecast: forecastRecord,
      provider: drafter.id,
      model: drafter.modelId,
      providerRequests,
      usage: combineProviderUsage(providerRequests),
    };
    const ambiguous = providerRequests.some((item) => item.outcome === "ambiguous");
    if (ambiguous || !checked?.ok) {
      const failureReason = ambiguous
        ? "Provider completion is ambiguous. This request may already have been charged. Start a new attempt before sending another provider request. Completion is not exactly once."
        : (checked?.reasons.join("; ") ?? drafted.error?.message ?? "Report check failed");
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
    if (current.providerRequests.some((item) => item.outcome === "completed" && item.response)) {
      throw error;
    }
    const reason = error instanceof Error ? error.message : String(error);
    return failAttempt(reason);
  }
}
