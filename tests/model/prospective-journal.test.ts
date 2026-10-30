import { describe, expect, it } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseOffer } from "../../src/lib/domain/offer.ts";
import { buildProspectiveSample } from "../../src/lib/server/analysis/prospective-sample.ts";
import type { JournalExport } from "../../src/lib/server/db/repository.ts";
import { parseArtifact } from "../../src/lib/server/models/inputs.ts";
import { PROSPECTIVE_PROTOCOL, releaseFromJournal } from "../../src/lib/server/models/release.ts";
import { createMemoryStore } from "../../src/lib/server/analysis/store.ts";
import { parseProtocolRegistration } from "../../src/lib/server/models/protocol.ts";

const artifact = parseArtifact(
  JSON.parse(
    readFileSync("tests/fixtures/models/browser-forecasting-model.json", "utf8"),
  ) as unknown,
);
const registeredAt = "2026-10-27T00:00:00.000Z";
const registration = {
  id: "prospective-registered",
  registeredAt,
  cohort: "primary-model-picks" as const,
  protocol: { ...PROSPECTIVE_PROTOCOL, artifactChecksum: artifact.checksum },
};
function journal(count: number): JournalExport {
  const gameBoards = [],
    gameSettlementNotices = [],
    closingMarketSnapshots = [];
  for (let i = 0; i < count; i++) {
    const gameId = `game-${i}`,
      boardId = randomUUID(),
      pickId = randomUUID();
    const kickoff = new Date(
      Date.parse("2026-11-01T18:00:00Z") + (i % 20) * 7 * 86400000,
    ).toISOString();
    const cutoff = new Date(Date.parse(kickoff) - 7200000).toISOString();
    const observedAt = new Date(Date.parse(kickoff) - 3600000).toISOString();
    const recordedAt = new Date(Date.parse(kickoff) - 1800000).toISOString();
    const quote = (selection: "home" | "away", observed: string) =>
      parseOffer({
        gameId,
        sportsbook: "book",
        market: "moneyline",
        selection,
        americanOdds: -110,
        observedAt: observed,
        kickoffAt: kickoff,
        rules: { period: "full-game", overtime: "included", tie: "push" },
      });
    const offers = [quote("home", cutoff), quote("away", cutoff)];
    const pick = {
      id: pickId,
      boardId,
      market: "moneyline",
      role: { role: "primary", reason: "frozen", protocolId: PROSPECTIVE_PROTOCOL.id },
      forecastingModel: { checksum: artifact.checksum },
      calculation: { pickedSelection: "home" },
      forecast: {
        provenance: "captured",
        decisionCutoff: cutoff,
        artifact: { checksum: artifact.checksum },
        protocolRegistrationId: registration.id,
        inputAvailability: { version: PROSPECTIVE_PROTOCOL.inputAvailability },
        marketEligibility: { market: "moneyline" },
        probabilities: { win: 0.7, loss: 0.3, push: 0 },
      },
    };
    gameBoards.push({
      id: boardId,
      game: { id: gameId, kickoff },
      request: { protocolRegistrationId: registration.id },
      parentId: null,
      withdrawal: null,
      status: "completed",
      cutoffAt: cutoff,
      completedAt: new Date(Date.parse(cutoff) + 60000).toISOString(),
      markets: [{ market: "moneyline", pick, offers }],
    });
    gameSettlementNotices.push({
      id: randomUUID(),
      eventId: `event-${i}`,
      gameId,
      analysisId: null,
      betId: null,
      kind: "final",
      homeScore: 24,
      awayScore: 14,
      source: "score",
      reason: null,
      correctsId: null,
      recordedAt: new Date(Date.parse(kickoff) + 14400000).toISOString(),
      payloadKey: `score-${i}`,
    });
    closingMarketSnapshots.push({
      id: randomUUID(),
      gameId,
      market: "moneyline",
      observedAt,
      recordedAt,
      source: "book",
      offers: [quote("home", observedAt), quote("away", observedAt)],
    });
  }
  return {
    version: 1,
    games: [],
    offers: [],
    evidence: [],
    analyses: [],
    reports: [],
    userResearch: [],
    bets: [],
    settlements: [],
    closings: [],
    protocolRegistrations: [registration],
    gameBoards,
    gameSettlementNotices,
    closingMarketSnapshots,
  } as unknown as JournalExport;
}

describe("prospective journal qualification", () => {
  it("parses only the frozen registration settings and rejects malformed provenance", () => {
    expect(parseProtocolRegistration(registration)).toEqual(registration);
    for (const value of [
      null,
      {},
      { ...registration, registeredAt: "not-a-time" },
      { ...registration, protocol: { ...registration.protocol, frozenBeforeOutcomes: "yes" } },
      {
        ...registration,
        protocol: {
          ...registration.protocol,
          period: { start: "2026-11-01T00:00:00Z", end: null },
        },
      },
      { ...registration, protocol: { ...registration.protocol, minimumPricedGames: 1 } },
    ]) {
      expect(() => parseProtocolRegistration(value)).toThrow();
    }
  });
  it("rejects cross-game, backwards, and duplicate notice events without restoring any records", async () => {
    const store = createMemoryStore();
    const before = await store.exportJournal();
    for (const defect of ["other-game", "backwards", "duplicate-event"] as const) {
      const backup = journal(2);
      const [first, second] = backup.gameSettlementNotices!;
      if (defect === "other-game") second!.correctsId = first!.id;
      if (defect === "backwards") {
        second!.gameId = first!.gameId;
        second!.correctsId = first!.id;
        second!.recordedAt = first!.recordedAt;
      }
      if (defect === "duplicate-event") second!.eventId = first!.eventId;
      await expect(store.restoreJournal(backup)).rejects.toThrow(/earlier notice|event identifier/);
      expect(await store.exportJournal()).toEqual(before);
    }
  });
  it("recomputes a qualifying market from frozen picks and later paired closes", () => {
    const backup = journal(500);
    const sample = buildProspectiveSample({ journal: backup, registrationId: registration.id });
    expect(sample.records).toHaveLength(500);
    expect(sample.records[0]?.closingBaseline?.win).toBeCloseTo(0.5);
    expect(sample.records[0]?.outcome).toBe("win");
    expect(
      releaseFromJournal({ artifact, journal: backup, registrationId: registration.id })
        .releasedMarkets,
    ).toEqual(["moneyline"]);
  }, 30_000);
  it("keeps a frozen primary after a later withdrawal", () => {
    const backup = journal(1);
    backup.gameBoards![0]!.withdrawal = { at: "2030-01-01T00:00:00Z", reason: "later withdrawal" };
    const sample = buildProspectiveSample({ journal: backup, registrationId: registration.id });
    expect(sample.records).toHaveLength(1);
    expect(sample.records[0]?.outcome).toBe("win");
  });
  it("excludes a forecast when an anchor quote was observed after its cutoff", () => {
    const backup = journal(1);
    const board = backup.gameBoards![0]!;
    board.markets[0]!.offers[1].observedAt = new Date(
      Date.parse(board.cutoffAt) + 1000,
    ).toISOString();
    const sample = buildProspectiveSample({ journal: backup, registrationId: registration.id });
    expect(sample.records).toHaveLength(0);
    expect(sample.excluded[0]?.reason).toBe("quote-after-decision-cutoff");
  });
  it("excludes a final result recorded before kickoff", () => {
    const backup = journal(1);
    backup.gameSettlementNotices![0]!.recordedAt = backup.gameBoards![0]!.completedAt!;
    const sample = buildProspectiveSample({ journal: backup, registrationId: registration.id });
    expect(sample.records).toHaveLength(0);
    expect(sample.excluded[0]?.reason).toBe("final-result-before-kickoff");
  });
  it("excludes pre-registration forecasts", () => {
    const backup = journal(1);
    backup.gameBoards![0]!.cutoffAt = "2026-10-26T12:00:00.000Z";
    const sample = buildProspectiveSample({ journal: backup, registrationId: registration.id });
    expect(sample.records).toHaveLength(0);
    expect(sample.excluded[0]?.reason).toBe("not-after-registration");
  });
  it("excludes a forecast captured at the registration instant", () => {
    const backup = journal(1);
    backup.gameBoards![0]!.cutoffAt = registeredAt;
    backup.gameBoards![0]!.markets[0]!.pick!.forecast!.decisionCutoff = registeredAt;
    const sample = buildProspectiveSample({ journal: backup, registrationId: registration.id });
    expect(sample.records).toHaveLength(0);
    expect(sample.excluded[0]?.reason).toBe("not-after-registration");
  });
  it("rejects repeated primary games instead of counting them", () => {
    const backup = journal(2);
    backup.gameBoards![1]!.game.id = backup.gameBoards![0]!.game.id;
    backup.gameSettlementNotices!.pop();
    backup.closingMarketSnapshots!.pop();
    expect(() =>
      buildProspectiveSample({ journal: backup, registrationId: registration.id }),
    ).toThrow(/Conflicting primary/);
  });
  it("counts identical repeated board records once and rejects changed source identities", () => {
    const backup = journal(1);
    backup.gameBoards!.push(structuredClone(backup.gameBoards![0]!));
    expect(
      buildProspectiveSample({ journal: backup, registrationId: registration.id }).records,
    ).toHaveLength(1);
    backup.gameBoards![1]!.completedAt = "2026-11-01T16:02:00.000Z";
    expect(() =>
      buildProspectiveSample({ journal: backup, registrationId: registration.id }),
    ).toThrow(/conflicting.*board/i);
  });

  it("reports the specific missing qualification fact", () => {
    const backup = journal(2);
    backup.gameBoards![0]!.completedAt = null;
    backup.gameBoards![1]!.markets[0]!.pick!.forecast!.artifact.checksum = "f".repeat(64);
    const sample = buildProspectiveSample({ journal: backup, registrationId: registration.id });
    expect(sample.records).toHaveLength(0);
    expect(sample.excluded.map((item) => item.reason)).toEqual([
      "missing-completion-provenance",
      "artifact-mismatch",
    ]);
  });

  it.each([
    ["refresh", "not-primary"],
    ["legacy", "missing-captured-forecast"],
    ["input-version", "input-protocol-mismatch"],
    ["completed-after-kickoff", "not-completed-pregame"],
    ["different-cutoff", "decision-cutoff-mismatch"],
  ])("excludes %s without calling a forecasting model", (defect, reason) => {
    const backup = journal(1);
    const board = backup.gameBoards![0]!;
    const pick = board.markets[0]!.pick!;
    if (defect === "refresh") board.parentId = board.id;
    if (defect === "legacy") pick.forecast!.provenance = "legacy-unknown";
    if (defect === "input-version")
      Object.assign(pick.forecast!.inputAvailability, { version: "wrong-version" });
    if (defect === "completed-after-kickoff") board.completedAt = board.game.kickoff;
    if (defect === "different-cutoff") pick.forecast!.decisionCutoff = registeredAt;
    const sample = buildProspectiveSample({ journal: backup, registrationId: registration.id });
    expect(sample.records).toHaveLength(0);
    expect(sample.excluded).toEqual([{ id: pick.id, reason }]);
  });

  it("never releases 500 identical historical copies or trusts an imported verdict", () => {
    const backup = journal(1);
    const board = backup.gameBoards![0]!;
    board.cutoffAt = "2024-01-01T00:00:00Z";
    backup.gameBoards = Array.from({ length: 500 }, () => structuredClone(board));
    Object.assign(backup, {
      evaluation: { markets: { moneyline: { release: { released: true } } } },
    });
    const sample = buildProspectiveSample({ journal: backup, registrationId: registration.id });
    expect(sample.records).toHaveLength(0);
    expect(sample.excluded).toHaveLength(1);
    expect(() =>
      releaseFromJournal({ artifact, journal: backup, registrationId: registration.id }),
    ).toThrow(/No market passed/);
  });

  it("keeps missing and incompatible closes and unresolved outcomes unavailable", () => {
    const backup = journal(3);
    backup.closingMarketSnapshots!.shift();
    const closing = backup.closingMarketSnapshots![0]!;
    closing.offers.forEach((offer) => {
      offer.sportsbook = "different-book";
    });
    backup.gameSettlementNotices!.pop();
    const sample = buildProspectiveSample({ journal: backup, registrationId: registration.id });
    expect(sample.records).toHaveLength(3);
    expect(sample.records[0]!.closingBaseline).toBeNull();
    expect(sample.records[1]!.closingBaseline).toBeNull();
    expect(sample.records[2]!.outcome).toBeNull();
  });

  it("rejects malformed model and closing probabilities before diagnostic scoring", async () => {
    const { evaluateProspectiveForecasts, protocolForArtifact } =
      await import("../../src/lib/server/models/prospective.ts");
    const sample = buildProspectiveSample({ journal: journal(1), registrationId: registration.id });
    const record = sample.records[0]!;
    for (const field of ["probabilities", "closingBaseline"] as const) {
      expect(() =>
        evaluateProspectiveForecasts(protocolForArtifact(artifact.checksum), [
          { ...record, [field]: { win: 0.9, loss: 0.8, push: 0 } },
        ]),
      ).toThrow(/probabilit/i);
    }
  });

  it("uses the saved push probability when a two-sided integer line has a push", () => {
    const backup = journal(1);
    const board = backup.gameBoards![0]!;
    const market = board.markets[0]!;
    const snapshot = backup.closingMarketSnapshots![0]!;
    const offer = market.offers[0];
    const spread = (selection: "home" | "away", observedAt: string) =>
      parseOffer({
        gameId: board.game.id,
        sportsbook: "book",
        market: "spread",
        selection,
        pointLine: selection === "home" ? -3 : 3,
        americanOdds: -110,
        observedAt,
        kickoffAt: board.game.kickoff,
        rules: { period: "full-game", overtime: "included" },
      });
    market.market = "spread";
    market.offers = [spread("home", offer.observedAt), spread("away", offer.observedAt)];
    market.pick!.market = "spread";
    market.pick!.calculation.market = "spread";
    market.pick!.forecast!.marketEligibility.market = "spread";
    market.pick!.forecast!.probabilities = { win: 0.6, loss: 0.32, push: 0.08 };
    snapshot.market = "spread";
    snapshot.offers = [spread("home", snapshot.observedAt), spread("away", snapshot.observedAt)];
    backup.gameSettlementNotices![0]!.awayScore = 21;
    const sample = buildProspectiveSample({ journal: backup, registrationId: registration.id });
    expect(sample.records[0]?.outcome).toBe("push");
    expect(sample.records[0]?.closingBaseline).toEqual({ win: 0.46, loss: 0.46, push: 0.08 });
  });
});
