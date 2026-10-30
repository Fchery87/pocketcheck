import { proportionalMargin } from "#lib/domain/odds.ts";
import type { Offer } from "#lib/domain/offer.ts";
import { assertRestorable, type JournalExport } from "../db/repository.ts";
import { slateOf } from "../models/uncertainty.ts";
import { validateProtocolRegistration, type ProtocolRegistration } from "../models/protocol.ts";
import type { Market } from "../models/games.ts";
import type { FrozenForecastRecord } from "../models/prospective.ts";
import { gradeFromNotices } from "./store.ts";

const qualification = Symbol("qualified-prospective-sample");

type QualifiedForecastRecord = FrozenForecastRecord & {
  boardId: string;
  gameId: string;
  completedAt: string;
  kickoffAt: string;
  registrationId: string;
  closingSnapshotId: string | null;
  /** When the selected close was observed. Provenance only: it does not choose the close. */
  closingObservedAt: string | null;
  contract: Offer;
};

export type ProspectiveSample = {
  readonly [qualification]: true;
  protocol: ProtocolRegistration;
  records: QualifiedForecastRecord[];
  excluded: { id: string; reason: string }[];
};

function sameContract(a: Offer, b: Offer): boolean {
  return (
    a.gameId === b.gameId &&
    a.market === b.market &&
    a.selection === b.selection &&
    a.pointLine === b.pointLine &&
    a.sportsbook === b.sportsbook &&
    a.rules.period === b.rules.period &&
    a.rules.overtime === b.rules.overtime &&
    a.rules.tie === b.rules.tie
  );
}

function validProbabilities(probabilities: { win: number; loss: number; push: number }): boolean {
  const values = [probabilities.win, probabilities.loss, probabilities.push];
  return (
    values.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) &&
    Math.abs(values.reduce((sum, n) => sum + n, 0) - 1) < 1e-9
  );
}

export function buildProspectiveSample(input: {
  journal: JournalExport;
  registrationId: string;
}): ProspectiveSample {
  assertRestorable(input.journal);
  const registration = input.journal.protocolRegistrations?.find(
    (item) => item.id === input.registrationId,
  );
  if (!registration)
    throw new Error("No saved prospective protocol registration exists for this identifier.");
  validateProtocolRegistration(registration);
  const { protocol } = registration;
  const records: QualifiedForecastRecord[] = [];
  const excluded: ProspectiveSample["excluded"] = [];
  const primary = new Set<string>();
  const identifiers = new Set<string>();
  const boards = new Map<string, string>();
  const noticesByGame = new Map<string, NonNullable<JournalExport["gameSettlementNotices"]>>();
  for (const notice of input.journal.gameSettlementNotices ?? []) {
    if (notice.gameId === null) throw new Error("A game settlement needs its game identity.");
    const notices = noticesByGame.get(notice.gameId) ?? [];
    notices.push(notice);
    noticesByGame.set(notice.gameId, notices);
  }
  const closesByMarket = new Map<string, NonNullable<JournalExport["closingMarketSnapshots"]>>();
  for (const close of input.journal.closingMarketSnapshots ?? []) {
    const key = `${close.gameId}:${close.market}`;
    const closes = closesByMarket.get(key) ?? [];
    closes.push(close);
    closesByMarket.set(key, closes);
  }
  for (const board of input.journal.gameBoards ?? []) {
    const serialized = JSON.stringify(board);
    const previous = boards.get(board.id);
    if (previous !== undefined) {
      if (previous !== serialized)
        throw new Error(`Conflicting game board identifier ${board.id}.`);
      continue;
    }
    boards.set(board.id, serialized);
    for (const market of board.markets) {
      const pick = market.pick;
      if (!pick) continue;
      const skip = (reason: string) => excluded.push({ id: pick.id, reason });
      if (identifiers.has(pick.id)) throw new Error(`Duplicate model pick identifier ${pick.id}.`);
      identifiers.add(pick.id);
      if (pick.role.role !== "primary" || board.parentId !== null) {
        skip("not-primary");
        continue;
      }
      const key = `${board.game.id}:${market.market}`;
      if (primary.has(key)) throw new Error(`Conflicting primary model picks for ${key}.`);
      primary.add(key);
      const forecast = pick.forecast;
      const cutoff = Date.parse(board.cutoffAt);
      const kickoff = Date.parse(board.game.kickoff);
      const completed = board.completedAt ? Date.parse(board.completedAt) : NaN;
      const registered = Date.parse(registration.registeredAt);
      const start = Date.parse(protocol.period.start);
      const end = protocol.period.end ? Date.parse(protocol.period.end) : Infinity;
      const checks: [boolean, string][] = [
        [!forecast || forecast.provenance !== "captured", "missing-captured-forecast"],
        [
          board.status !== "completed" || !Number.isFinite(completed),
          "missing-completion-provenance",
        ],
        [!Number.isFinite(cutoff) || !Number.isFinite(kickoff), "missing-frozen-chronology"],
        [cutoff <= registered, "not-after-registration"],
        [cutoff < start || cutoff >= end, "outside-protocol-period"],
        [cutoff >= kickoff || completed < cutoff || completed >= kickoff, "not-completed-pregame"],
        [
          board.request.protocolRegistrationId !== registration.id ||
            forecast?.protocolRegistrationId !== registration.id,
          "registration-mismatch",
        ],
        [forecast?.decisionCutoff !== board.cutoffAt, "decision-cutoff-mismatch"],
        [
          forecast?.artifact.checksum !== protocol.artifactChecksum ||
            pick.forecastingModel.checksum !== protocol.artifactChecksum,
          "artifact-mismatch",
        ],
        [
          forecast?.inputAvailability.version !== protocol.inputAvailability,
          "input-protocol-mismatch",
        ],
        [forecast?.marketEligibility.market !== market.market, "forecast-market-mismatch"],
        [!forecast || !validProbabilities(forecast.probabilities), "invalid-probabilities"],
      ];
      const problem = checks.find(([failed]) => failed)?.[1];
      if (problem || !forecast) {
        skip(problem ?? "missing-captured-forecast");
        continue;
      }
      const offer = market.offers.find(
        (item) => item.selection === pick.calculation.pickedSelection,
      );
      if (!offer) {
        skip("missing-picked-contract");
        continue;
      }
      if (
        pick.boardId !== board.id ||
        pick.market !== market.market ||
        offer.gameId !== board.game.id ||
        offer.market !== market.market ||
        offer.kickoffAt !== board.game.kickoff
      ) {
        skip("picked-contract-mismatch");
        continue;
      }
      if (
        market.offers.some((side) => {
          const observed = Date.parse(side.observedAt);
          const opposing = side.opposing ? Date.parse(side.opposing.observedAt) : observed;
          return (
            !Number.isFinite(observed) ||
            !Number.isFinite(opposing) ||
            observed > cutoff ||
            opposing > cutoff
          );
        })
      ) {
        skip("quote-after-decision-cutoff");
        continue;
      }
      const notices = noticesByGame.get(board.game.id) ?? [];
      if (
        notices.some((notice) => notice.kind === "final" && Date.parse(notice.recordedAt) < kickoff)
      ) {
        skip("final-result-before-kickoff");
        continue;
      }
      if (notices.some((notice) => Date.parse(notice.recordedAt) <= completed)) {
        skip("completion-not-proven-before-result");
        continue;
      }
      const result = gradeFromNotices(offer, notices).effective;
      const outcome = result === "win" || result === "loss" || result === "push" ? result : null;
      const matches = (closesByMarket.get(key) ?? [])
        .filter(
          (snapshot) =>
            snapshot.gameId === board.game.id &&
            snapshot.market === market.market &&
            Date.parse(snapshot.observedAt) > Date.parse(offer.observedAt) &&
            Date.parse(snapshot.observedAt) > cutoff &&
            Date.parse(snapshot.observedAt) < kickoff &&
            snapshot.offers.some((side) => sameContract(side, offer)),
        )
        .sort(
          (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt) || a.id.localeCompare(b.id),
        );
      const snapshot = matches.at(-1);
      let closingBaseline: FrozenForecastRecord["closingBaseline"] = null;
      if (snapshot) {
        const side = snapshot.offers.find((item) => sameContract(item, offer))!;
        const other = snapshot.offers.find((item) => item.selection !== side.selection)!;
        const fair = proportionalMargin([
          { side: "selected", american: side.americanOdds },
          { side: "other", american: other.americanOdds },
        ]);
        if (fair.available) {
          // A two-sided quote prices decisive outcomes only. Reuse the frozen forecast's push
          // probability, as historical evaluation does; the close does not independently price it.
          const win = fair.probabilities.selected! * (1 - forecast.probabilities.push);
          closingBaseline = {
            win,
            loss: 1 - forecast.probabilities.push - win,
            push: forecast.probabilities.push,
          };
        }
      }
      records.push({
        id: pick.id,
        boardId: board.id,
        gameId: board.game.id,
        completedAt: board.completedAt!,
        kickoffAt: board.game.kickoff,
        registrationId: registration.id,
        closingSnapshotId: snapshot?.id ?? null,
        closingObservedAt: snapshot?.observedAt ?? null,
        contract: structuredClone(offer),
        decisionCutoff: board.cutoffAt,
        artifactChecksum: forecast.artifact.checksum,
        market: market.market,
        probabilities: forecast.probabilities,
        closingBaseline,
        executableOfferAt: offer.observedAt,
        slate: slateOf(board.game.kickoff),
        outcome,
      });
    }
  }
  return { [qualification]: true, protocol: registration, records, excluded };
}

export type CloseAge = {
  closes: number;
  missing: number;
  minutesBeforeKickoff: { median: number; p90: number; oldest: number } | null;
};

/**
 * How long before kickoff each qualified record's close was observed. The latest matching quote
 * before kickoff can still be days old, so this shows whether the closing comparison is a close.
 */
export function closeAgeByMarket(sample: ProspectiveSample): Record<Market, CloseAge> {
  const rank = (sorted: number[], fraction: number) =>
    sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]!;
  const age = {} as Record<Market, CloseAge>;
  for (const market of ["moneyline", "spread", "total"] as const) {
    const members = sample.records.filter((record) => record.market === market);
    const minutes = members
      .flatMap((record) =>
        record.closingObservedAt === null
          ? []
          : [(Date.parse(record.kickoffAt) - Date.parse(record.closingObservedAt)) / 60000],
      )
      .sort((a, b) => a - b);
    age[market] = {
      closes: minutes.length,
      missing: members.length - minutes.length,
      minutesBeforeKickoff:
        minutes.length === 0
          ? null
          : { median: rank(minutes, 0.5), p90: rank(minutes, 0.9), oldest: minutes.at(-1)! },
    };
  }
  return age;
}
