import { randomUUID } from "node:crypto";
import type { Offer } from "#lib/domain/offer.ts";
import type { ThesisReport } from "../providers/contracts.ts";
import type { RunModel } from "./model.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { PolicyDecision } from "./policy.ts";
import type { EvidenceItem } from "../sources/contracts.ts";
import type { AttemptRequest } from "./attempt.ts";
import { classifyPregameRuns, type PregameRun } from "./primary.ts";

/**
 * Research store contract.
 *
 * The app uses the Neon store in `neon-store.ts`. The memory store exists for unit
 * tests and for Playwright, which opts in with POCKETCHECK_JOURNAL=memory.
 * Completed runs are immutable: a refresh saves a new id and leaves the parent
 * unchanged. The private lean is stored beside the run, never inside the packet.
 */

export type ProgressStage =
  | "checking inputs"
  | "collecting evidence"
  | "computing"
  | "drafting"
  | "checking report";

export const progressStages: ProgressStage[] = [
  "checking inputs",
  "collecting evidence",
  "computing",
  "drafting",
  "checking report",
];

export type RunUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  /** US dollars, as the provider reported it. Null when it reported no cost. */
  costUsd: number | null;
};

export type RunStatus = "pending" | "running" | "completed" | "interrupted" | "failed";

export type PrivateLean = {
  text: string;
  rationale: string;
};

export type SnapshotProvenance = "captured" | "legacy-unknown";

/** The game as it stood when the run was saved. */
export type RunGame = {
  id: string;
  season: number;
  week: number | null;
  home: string;
  away: string;
  kickoff: string;
  venue: string | null;
};

export type ResearchRun = {
  id: string;
  request: AttemptRequest | null;
  parentId: string | null;
  snapshotVersion: 1;
  snapshotProvenance: SnapshotProvenance;
  /** Decision cutoff: evidence after this instant was excluded. */
  cutoffAt: string;
  status: RunStatus;
  stages: ProgressStage[];
  game: RunGame;
  offer: Offer;
  lean: PrivateLean | null;
  evidence: EvidenceItem[];
  evidencePacketHash: string;
  /** Missing evidence and caveats found while collecting, owned by the app, not the drafter. */
  gaps: string[];
  /** Drafting usage as the provider reported it. Null when it reported none. */
  usage: RunUsage | null;
  report: ThesisReport | null;
  renderedText: string;
  failureReason: string | null;
  policy: PolicyDecision | null;
  /** The probability model this run froze. Null for runs saved before models were wired in. */
  probabilityModel: RunModel | null;
  /**
   * Decision-time forecast inputs. Null marks a legacy run whose input provenance was not captured.
   */
  forecast: SavedForecast | null;
  provider: string;
  model: string;
  createdAt: string;
  /** Set when the attempt first reaches a terminal status. Null while pending or running. */
  completedAt: string | null;
  /**
   * Frozen when the attempt reaches a terminal status. Null until then, and
   * null for historical rows that were never classified at completion.
   */
  assessmentRole: AssessmentRole | null;
};

export type NewRun = Omit<
  ResearchRun,
  "id" | "createdAt" | "completedAt" | "assessmentRole" | "snapshotVersion" | "snapshotProvenance"
> & {
  id?: string;
};

export type BeginAttemptResult =
  | { kind: "created"; run: ResearchRun }
  | { kind: "existing"; run: ResearchRun }
  | { kind: "conflict"; error: string };

/** One journal row. Listing never loads every full run. */
/** Frozen before outcomes are used. Legacy rows were not classified at completion. */
export type AssessmentRole =
  | { role: "primary"; reason: string }
  | { role: "refresh"; primaryId: string; reason: string }
  | { role: "ineligible"; reason: string }
  | { role: "unclassified"; reason: string };

export type RunSummary = {
  id: string;
  parentId: string | null;
  snapshotProvenance: SnapshotProvenance;
  createdAt: string;
  conclusion: string;
  game: Pick<RunGame, "id" | "home" | "away" | "kickoff">;
  offer: Pick<Offer, "sportsbook" | "market" | "selection" | "pointLine" | "americanOdds">;
  reliesOnManualEvidence: boolean;
  /** Null only while a store has not yet attached a role. The journal always fills it. */
  assessmentRole: AssessmentRole;
};

export function summarize(run: ResearchRun): Omit<RunSummary, "assessmentRole"> {
  return {
    id: run.id,
    parentId: run.parentId,
    snapshotProvenance: run.snapshotProvenance,
    createdAt: run.createdAt,
    conclusion: run.policy?.conclusion ?? run.report?.conclusion ?? "unknown",
    game: { id: run.game.id, home: run.game.home, away: run.game.away, kickoff: run.game.kickoff },
    offer: {
      sportsbook: run.offer.sportsbook,
      market: run.offer.market,
      selection: run.offer.selection,
      pointLine: run.offer.pointLine,
      americanOdds: run.offer.americanOdds,
    },
    reliesOnManualEvidence: run.policy?.reliesOnManualEvidence ?? false,
  };
}

const PRIMARY_REASON = "Earliest completed analysis before kickoff";
const REFRESH_REASON = "Later completed analysis. The primary assessment is unchanged.";
const AFTER_KICKOFF_REASON =
  "Decision cutoff is not before kickoff, so this analysis is not an eligible pregame assessment.";
const UNCLASSIFIED_REASON =
  "Completion time was not recorded, so this analysis was not classified before outcomes.";

export function assessmentRoleFor(
  run: Pick<ResearchRun, "id" | "status" | "cutoffAt" | "game" | "createdAt"> & {
    completedAt: string | null;
  },
  siblings: Array<
    Pick<ResearchRun, "id" | "status" | "cutoffAt" | "game" | "createdAt"> & {
      completedAt: string | null;
    }
  >,
): AssessmentRole {
  if (run.status === "completed" && run.completedAt === null) {
    return { role: "unclassified", reason: UNCLASSIFIED_REASON };
  }
  const pregame: PregameRun[] = siblings.map((item) => ({
    id: item.id,
    gameId: item.game.id,
    completedAt: item.status === "completed" ? item.completedAt : null,
    cutoffAt: item.cutoffAt,
    kickoffAt: item.game.kickoff,
    status: item.status === "interrupted" ? "interrupted" : item.status,
  }));
  const choice = classifyPregameRuns(pregame).find((item) => item.id === run.id);
  if (!choice || choice.role === "ineligible") {
    const reason =
      choice?.reason === "after-kickoff"
        ? AFTER_KICKOFF_REASON
        : "This analysis did not complete before kickoff.";
    return { role: "ineligible", reason };
  }
  if (choice.role === "primary") return { role: "primary", reason: PRIMARY_REASON };
  return { role: "refresh", primaryId: choice.primaryId, reason: REFRESH_REASON };
}

export type ActualBet = {
  id: string;
  analysisId: string;
  sportsbook: string;
  americanOdds: number;
  stakeUnits: number;
  placedAt: string;
};

export type ResearchStore = {
  beginAttempt: (run: NewRun) => Promise<BeginAttemptResult>;
  updateAttempt: (run: NewRun) => Promise<ResearchRun>;
  saveRun: (run: NewRun) => Promise<ResearchRun>;
  getRun: (id: string) => Promise<ResearchRun | null>;
  /** Newest first. */
  listCompleted: () => Promise<RunSummary[]>;
  markInterrupted: (id: string) => Promise<ResearchRun | null>;
  recordBet: (bet: Omit<ActualBet, "id">) => Promise<ActualBet>;
  listBets: () => Promise<ActualBet[]>;
  /** Test seam: a completed row whose role was never frozen at completion. */
  recordUnclassifiedCompleted?: (run: ResearchRun) => Promise<void>;
};

export function createMemoryStore(): ResearchStore {
  const runs = new Map<string, ResearchRun>();
  const requests = new Map<string, string>();
  const bets: ActualBet[] = [];

  function freezeRole(saved: ResearchRun): AssessmentRole {
    const completedAt = saved.completedAt ?? saved.createdAt;
    const sameGame = [...runs.values()].filter((run) => run.game.id === saved.game.id);
    const existingPrimary = sameGame.find((run) => run.assessmentRole?.role === "primary");
    if (saved.status !== "completed" || completedAt === null) {
      return assessmentRoleFor({ ...saved, completedAt: null }, [{ ...saved, completedAt: null }]);
    }
    if (!(Date.parse(saved.cutoffAt) < Date.parse(saved.game.kickoff))) {
      return assessmentRoleFor({ ...saved, completedAt }, [{ ...saved, completedAt }]);
    }
    if (!existingPrimary || existingPrimary.id === saved.id) {
      return { role: "primary", reason: "Earliest completed analysis before kickoff" };
    }
    return {
      role: "refresh",
      primaryId: existingPrimary.id,
      reason: "Later completed analysis. The primary assessment is unchanged.",
    };
  }

  return {
    async beginAttempt(input) {
      const requestId = input.request?.id;
      const requestHash = input.request?.hash;
      if (!requestId || !requestHash) {
        return {
          kind: "conflict",
          error: "An attempt requires a request identifier and input hash.",
        };
      }
      const existingId = requests.get(requestId);
      if (existingId) {
        const existing = runs.get(existingId);
        if (!existing) throw new Error(`Attempt index is inconsistent: ${requestId}`);
        if (existing.request?.hash !== requestHash) {
          return {
            kind: "conflict",
            error: "This request identifier was already used with different inputs.",
          };
        }
        return { kind: "existing", run: structuredClone(existing) };
      }
      const id = input.id ?? randomUUID();
      const createdAt = new Date().toISOString();
      const terminal =
        input.status === "completed" || input.status === "failed" || input.status === "interrupted";
      const draft: ResearchRun = structuredClone({
        ...input,
        id,
        snapshotVersion: 1,
        snapshotProvenance: "captured",
        forecast: input.forecast ?? null,
        createdAt,
        completedAt: terminal ? createdAt : null,
        assessmentRole: null,
      });
      draft.assessmentRole = terminal ? freezeRole(draft) : null;
      runs.set(id, draft);
      requests.set(requestId, id);
      return { kind: "created", run: structuredClone(draft) };
    },
    async updateAttempt(input) {
      if (!input.id) throw new Error("An attempt update requires an analysis id.");
      const existing = runs.get(input.id);
      if (!existing) throw new Error(`Analysis not found: ${input.id}`);
      if (existing.status === "completed") return structuredClone(existing);
      if (
        existing.request?.id !== input.request?.id ||
        existing.request?.hash !== input.request?.hash
      ) {
        throw new Error("An attempt update cannot change its request identity or inputs.");
      }
      const terminal =
        input.status === "completed" || input.status === "failed" || input.status === "interrupted";
      const completedAt = existing.completedAt ?? (terminal ? new Date().toISOString() : null);
      const updated: ResearchRun = structuredClone({
        ...input,
        id: input.id,
        forecast: input.forecast === undefined ? existing.forecast : input.forecast,
        createdAt: existing.createdAt,
        completedAt,
        snapshotVersion: existing.snapshotVersion,
        snapshotProvenance: existing.snapshotProvenance,
        assessmentRole: existing.assessmentRole,
      });
      if (terminal && !updated.assessmentRole) updated.assessmentRole = freezeRole(updated);
      runs.set(updated.id, updated);
      return structuredClone(updated);
    },
    async saveRun(input) {
      return this.updateAttempt(input);
    },
    async getRun(id) {
      return runs.get(id) ?? null;
    },
    async listCompleted() {
      return [...runs.values()]
        .filter((run) => run.status === "completed")
        .reverse()
        .map((run) => ({
          ...summarize(run),
          assessmentRole: run.assessmentRole ?? {
            role: "unclassified" as const,
            reason:
              "Completion time was not recorded, so this analysis was not classified before outcomes.",
          },
        }));
    },
    async markInterrupted(id) {
      const run = runs.get(id);
      if (!run || run.status === "completed") return run ? structuredClone(run) : null;
      const interrupted: ResearchRun = {
        ...run,
        status: "interrupted",
        completedAt: run.completedAt ?? new Date().toISOString(),
        assessmentRole: run.assessmentRole,
      };
      if (!interrupted.assessmentRole) interrupted.assessmentRole = freezeRole(interrupted);
      runs.set(id, interrupted);
      return structuredClone(interrupted);
    },
    async recordBet(bet) {
      if (!runs.has(bet.analysisId)) throw new Error(`Analysis not found: ${bet.analysisId}`);
      const saved = { ...bet, id: randomUUID() };
      bets.push(saved);
      return saved;
    },
    async listBets() {
      return [...bets];
    },
    async recordUnclassifiedCompleted(run) {
      runs.set(
        run.id,
        structuredClone({ ...run, status: "completed", assessmentRole: null, completedAt: null }),
      );
    },
  };
}
