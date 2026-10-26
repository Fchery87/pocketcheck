import { createHash, randomUUID } from "node:crypto";
import { parseOffer, type Offer, type OfferRules, type SideSelection, type Market } from "#lib/domain/offer.ts";
import type { ProviderRequestRecord, ThesisReport } from "../providers/contracts.ts";
import type { RunModel } from "./model.ts";
import type { SavedForecast } from "./forecast-record.ts";
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
  /** US dollars, as the provider reported it. Null when cost is unknown, never an invented zero. */
  costUsd: number | null;
  /** True when any included request left a token or cost field unreported. */
  partial: boolean;
};

export type { ProviderRequestRecord };

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
  /** Combined usage across every known provider request. Null when none was reported. */
  usage: RunUsage | null;
  /** Durable provider exchanges. Empty for runs saved before response recovery. */
  providerRequests: ProviderRequestRecord[];
  /** True when a sent request has no durable completion and must not be retried automatically. */
  providerOutcomeAmbiguous: boolean;
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

export type ContractProvenance = "captured" | "legacy-unknown";

/**
 * The contract the bettor placed. `captured` stores that contract itself.
 * `legacy-unknown` means the journal only kept price, book, stake, and time,
 * so market, line, and rules must not be filled from the research offer.
 */
export type ActualBet = {
  id: string;
  analysisId: string;
  submissionId: string | null;
  contractProvenance: ContractProvenance;
  sportsbook: string;
  market: Market | null;
  selection: SideSelection | null;
  pointLine: number | null;
  rules: Offer["rules"] | null;
  americanOdds: number;
  stakeUnits: number;
  placedAt: string;
};

export type NewActualBet = {
  analysisId: string;
  submissionId: string;
  sportsbook: string;
  market: Market;
  selection: SideSelection;
  pointLine?: number;
  rules: OfferRules;
  americanOdds: number;
  stakeUnits: number;
  placedAt: string;
};

export type RecordBetResult =
  | { kind: "created"; bet: ActualBet }
  | { kind: "existing"; bet: ActualBet }
  | { kind: "conflict"; error: string };

export type ResearchStore = {
  beginAttempt: (run: NewRun) => Promise<BeginAttemptResult>;
  updateAttempt: (run: NewRun) => Promise<ResearchRun>;
  saveRun: (run: NewRun) => Promise<ResearchRun>;
  getRun: (id: string) => Promise<ResearchRun | null>;
  /** Newest first. */
  listCompleted: () => Promise<RunSummary[]>;
  markInterrupted: (id: string) => Promise<ResearchRun | null>;
  recordBet: (bet: NewActualBet) => Promise<RecordBetResult>;
  listBets: () => Promise<ActualBet[]>;
};

export function createMemoryStore(): ResearchStore {
  const runs = new Map<string, ResearchRun>();
  const requests = new Map<string, string>();
  const bets: ActualBet[] = [];
  const submissions = new Map<string, string>();
  const fingerprints = new Map<string, string>();
  let betWrites: Promise<unknown> = Promise.resolve();

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
        forecast: input.forecast ?? null,
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
      const write = betWrites.then(() =>
        recordMemoryBet({ runs, bets, submissions, fingerprints }, bet),
      );
      betWrites = write.then(
        () => undefined,
        () => undefined,
      );
      return write;
    },
    async listBets() {
      return [...bets];
    },
  };
}

function recordMemoryBet(
  state: {
    runs: Map<string, ResearchRun>;
    bets: ActualBet[];
    submissions: Map<string, string>;
    fingerprints: Map<string, string>;
  },
  input: NewActualBet,
): RecordBetResult {
  const run = state.runs.get(input.analysisId);
  if (!run) throw new Error(`Analysis not found: ${input.analysisId}`);
  if (!input.submissionId) throw new Error("An actual bet requires a submission identifier.");
  if (!Number.isFinite(input.stakeUnits) || input.stakeUnits <= 0) {
    throw new Error("Stake must be a positive number of units");
  }
  const contract = parseOffer({
    gameId: run.game.id,
    sportsbook: input.sportsbook,
    market: input.market,
    selection: input.selection,
    pointLine: input.pointLine,
    americanOdds: input.americanOdds,
    observedAt: input.placedAt,
    kickoffAt: run.game.kickoff,
    rules: input.rules,
  });
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        analysisId: input.analysisId,
        sportsbook: contract.sportsbook,
        market: contract.market,
        selection: contract.selection,
        pointLine: contract.pointLine,
        americanOdds: contract.americanOdds,
        rules: contract.rules,
        stakeUnits: input.stakeUnits,
        placedAt: input.placedAt,
      }),
    )
    .digest("hex");
  const existingId = state.submissions.get(input.submissionId);
  if (existingId) {
    const existing = state.bets.find((item) => item.id === existingId);
    if (!existing) throw new Error(`Bet submission index is inconsistent: ${input.submissionId}`);
    if (state.fingerprints.get(existing.id) !== fingerprint) {
      return {
        kind: "conflict",
        error: "This submission identifier was already used with different inputs.",
      };
    }
    return { kind: "existing", bet: structuredClone(existing) };
  }
  const saved: ActualBet = {
    id: randomUUID(),
    analysisId: input.analysisId,
    submissionId: input.submissionId,
    contractProvenance: "captured",
    sportsbook: contract.sportsbook,
    market: contract.market,
    selection: contract.selection,
    pointLine: contract.pointLine,
    rules: contract.rules,
    americanOdds: contract.americanOdds,
    stakeUnits: input.stakeUnits,
    placedAt: input.placedAt,
  };
  state.bets.push(saved);
  state.submissions.set(input.submissionId, saved.id);
  state.fingerprints.set(saved.id, fingerprint);
  return { kind: "created", bet: structuredClone(saved) };
}
