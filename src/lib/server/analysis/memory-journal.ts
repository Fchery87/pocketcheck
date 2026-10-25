import { randomUUID } from "node:crypto";
import type { Offer } from "#lib/domain/offer.ts";
import type { ThesisReport } from "../providers/contracts.ts";
import type { PolicyDecision } from "./policy.ts";
import type { ScheduledGame } from "../sources/contracts.ts";

/**
 * In-memory research journal.
 *
 * The Neon repository in `src/lib/server/db/repository.ts` remains the durable
 * store. Browser tests use this seam so Playwright does not require DATABASE_URL.
 * Completed runs are immutable: a refresh inserts a new id and leaves the parent
 * record, including its rendered report, unchanged. The private lean is stored
 * beside the run and is not part of `evidencePacketSent`.
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

export type ResearchRun = {
  id: string;
  parentId: string | null;
  status: RunStatus;
  stages: ProgressStage[];
  game: ScheduledGame;
  offer: Offer;
  lean: PrivateLean | null;
  evidencePacketSent: string;
  report: ThesisReport | null;
  renderedText: string;
  failureReason: string | null;
  policy: PolicyDecision | null;
  createdAt: string;
};

export type ActualBet = {
  id: string;
  analysisId: string | null;
  sportsbook: string;
  americanOdds: number;
  stakeUnits: number;
  placedAt: string;
};

export type MemoryJournal = {
  saveRun: (run: Omit<ResearchRun, "id" | "createdAt"> & { id?: string }) => ResearchRun;
  get: (id: string) => ResearchRun | null;
  listCompleted: () => ResearchRun[];
  markInterrupted: (id: string) => ResearchRun | null;
  recordBet: (bet: Omit<ActualBet, "id">) => ActualBet;
  listBets: () => ActualBet[];
  reset: () => void;
};

export function createMemoryJournal(): MemoryJournal {
  const runs = new Map<string, ResearchRun>();
  const bets: ActualBet[] = [];

  return {
    saveRun(input) {
      const id = input.id ?? randomUUID();
      const existing = runs.get(id);
      if (existing && existing.status === "completed") {
        return existing;
      }
      const saved: ResearchRun = {
        id,
        parentId: input.parentId,
        status: input.status,
        stages: [...input.stages],
        game: input.game,
        offer: input.offer,
        lean: input.lean,
        evidencePacketSent: input.evidencePacketSent,
        report: input.report,
        renderedText: input.renderedText,
        failureReason: input.failureReason,
        policy: input.policy,
        createdAt: new Date().toISOString(),
      };
      runs.set(id, saved);
      return saved;
    },
    get(id) {
      return runs.get(id) ?? null;
    },
    listCompleted() {
      return [...runs.values()].filter((run) => run.status === "completed");
    },
    markInterrupted(id) {
      const run = runs.get(id);
      if (!run || run.status === "completed") return run ?? null;
      const interrupted = { ...run, status: "interrupted" as const };
      runs.set(id, interrupted);
      return interrupted;
    },
    recordBet(bet) {
      const saved = { ...bet, id: randomUUID() };
      bets.push(saved);
      return saved;
    },
    listBets() {
      return [...bets];
    },
    reset() {
      runs.clear();
      bets.length = 0;
    },
  };
}

export const researchJournal = createMemoryJournal();
