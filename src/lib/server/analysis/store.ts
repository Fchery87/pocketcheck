import { randomUUID } from "node:crypto";
import type { Offer } from "#lib/domain/offer.ts";
import type { ThesisReport } from "../providers/contracts.ts";
import type { RunModel } from "./model.ts";
import type { PolicyDecision } from "./policy.ts";
import type { EvidenceItem } from "../sources/contracts.ts";
import type { AttemptRequest } from "./attempt.ts";

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
  provider: string;
  model: string;
  createdAt: string;
};

export type NewRun = Omit<
  ResearchRun,
  "id" | "createdAt" | "snapshotVersion" | "snapshotProvenance"
> & {
  id?: string;
};

export type BeginAttemptResult =
  | { kind: "created"; run: ResearchRun }
  | { kind: "existing"; run: ResearchRun }
  | { kind: "conflict"; error: string };

/** One journal row. Listing never loads every full run. */
export type RunSummary = {
  id: string;
  parentId: string | null;
  snapshotProvenance: SnapshotProvenance;
  createdAt: string;
  conclusion: string;
  game: Pick<RunGame, "id" | "home" | "away" | "kickoff">;
  offer: Pick<Offer, "sportsbook" | "market" | "selection" | "pointLine" | "americanOdds">;
  reliesOnManualEvidence: boolean;
};

export function summarize(run: ResearchRun): RunSummary {
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
};

export function createMemoryStore(): ResearchStore {
  const runs = new Map<string, ResearchRun>();
  const requests = new Map<string, string>();
  const bets: ActualBet[] = [];

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
      const saved: ResearchRun = structuredClone({
        ...input,
        id,
        snapshotVersion: 1,
        snapshotProvenance: "captured",
        createdAt: new Date().toISOString(),
      });
      runs.set(id, saved);
      requests.set(requestId, id);
      return { kind: "created", run: structuredClone(saved) };
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
      const updated: ResearchRun = structuredClone({
        ...input,
        id: input.id,
        createdAt: existing.createdAt,
        snapshotVersion: existing.snapshotVersion,
        snapshotProvenance: existing.snapshotProvenance,
      });
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
        .map(summarize);
    },
    async markInterrupted(id) {
      const run = runs.get(id);
      if (!run || run.status === "completed") return run ?? null;
      const interrupted = { ...run, status: "interrupted" as const };
      runs.set(id, interrupted);
      return interrupted;
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
  };
}
