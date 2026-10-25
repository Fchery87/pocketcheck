import { randomUUID } from "node:crypto";
import type { Offer } from "#lib/domain/offer.ts";
import type { ThesisReport } from "../providers/contracts.ts";
import type { PolicyDecision } from "./policy.ts";
import type { EvidenceItem } from "../sources/contracts.ts";

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

export type RunStatus = "completed" | "interrupted" | "failed";

export type PrivateLean = {
  text: string;
  rationale: string;
};

/** The game as it stood when the run was saved. */
export type RunGame = {
  id: string;
  season: number;
  week: number;
  home: string;
  away: string;
  kickoff: string;
  venue: string;
};

export type ResearchRun = {
  id: string;
  parentId: string | null;
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
  report: ThesisReport | null;
  renderedText: string;
  failureReason: string | null;
  policy: PolicyDecision | null;
  provider: string;
  model: string;
  createdAt: string;
};

export type NewRun = Omit<ResearchRun, "id" | "createdAt"> & { id?: string };

/** One journal row. Listing never loads every full run. */
export type RunSummary = {
  id: string;
  parentId: string | null;
  createdAt: string;
  conclusion: string;
  game: Pick<RunGame, "id" | "home" | "away" | "kickoff">;
  offer: Pick<Offer, "sportsbook" | "market" | "selection" | "pointLine" | "americanOdds">;
};

export function summarize(run: ResearchRun): RunSummary {
  return {
    id: run.id,
    parentId: run.parentId,
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
  const bets: ActualBet[] = [];

  return {
    async saveRun(input) {
      const id = input.id ?? randomUUID();
      const existing = runs.get(id);
      if (existing && existing.status === "completed") {
        return existing;
      }
      const saved: ResearchRun = structuredClone({
        ...input,
        id,
        createdAt: new Date().toISOString(),
      });
      runs.set(id, saved);
      return saved;
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
