import { expect, it } from "vite-plus/test";
import { descriptiveCohortMetrics, journalQualifiedForecasts } from "./summary.ts";
import type { SavedForecast } from "./forecast-record.ts";
import type { ActualBet } from "./store.ts";
import { laterNoVigBaseline } from "./closing.ts";
import type { Offer } from "#lib/domain/offer.ts";
import type { ClosingMarketSnapshot } from "../models/protocol.ts";

it("requires a later same-contract two-sided quote and preserves frozen push mass", () => {
  const offer: Offer = {
    gameId: "game",
    sportsbook: "book",
    market: "spread",
    selection: "home",
    pointLine: -3,
    americanOdds: -110,
    observedAt: "2026-11-01T15:00:00Z",
    kickoffAt: "2026-11-01T17:00:00Z",
    decimalOdds: 1 + 100 / 110,
    opposing: null,
    rules: { period: "full-game", overtime: "included", tie: null },
  };
  const close: ClosingMarketSnapshot = {
    id: "close",
    gameId: "game",
    market: "spread",
    offers: [
      {
        ...offer,
        americanOdds: -120,
        decimalOdds: 1 + 100 / 120,
        observedAt: "2026-11-01T16:00:00Z",
      },
      {
        ...offer,
        selection: "away",
        pointLine: 3,
        americanOdds: 120,
        decimalOdds: 2.2,
        observedAt: "2026-11-01T16:00:00Z",
      },
    ],
    observedAt: "2026-11-01T16:00:00Z",
    recordedAt: "2026-11-01T16:01:00Z",
    source: "test",
  };
  const input = {
    offer,
    cutoffAt: "2026-11-01T15:30:00Z",
    kickoffAt: "2026-11-01T17:00:00Z",
    probabilities: { win: 0.5, loss: 0.4, push: 0.1 },
    snapshots: [close],
  };
  expect(laterNoVigBaseline(input)).toEqual({
    win: expect.closeTo(0.49090909, 7),
    loss: expect.closeTo(0.4090909, 7),
    push: 0.1,
  });
  const forecast = {
    provenance: "captured",
    decisionCutoff: input.cutoffAt,
    probabilities: input.probabilities,
  } as SavedForecast;
  const source = {
    id: "analysis",
    role: "primary",
    offer,
    kickoffAt: input.kickoffAt,
    forecast,
    result: "win",
  };
  const bet: ActualBet & { result: string } = {
    id: "bet",
    analysisId: "analysis",
    modelPickId: null,
    submissionId: "placed",
    contractProvenance: "captured",
    sportsbook: offer.sportsbook,
    market: offer.market,
    selection: offer.selection,
    pointLine: offer.pointLine,
    rules: offer.rules,
    americanOdds: 120,
    stakeUnits: 2,
    placedAt: "2026-11-01T15:45:00Z",
    result: "loss",
  };
  const qualified = journalQualifiedForecasts({
    assessments: [source],
    modelPicks: [],
    bets: [
      bet,
      { ...bet, id: "different-line", pointLine: -3.5 },
      { ...bet, id: "different-book", sportsbook: "other" },
    ],
    snapshots: [close],
  });
  expect(qualified.assessments.map((row) => row.id)).toEqual(["analysis"]);
  expect(qualified.bets.map((row) => row.id)).toEqual(["bet"]);
  expect(qualified.bets[0]!.outcome).toBe("loss");
  expect(qualified.bets[0]!.probabilities).toEqual(input.probabilities);
  expect(qualified.bets[0]!.closingBaseline?.push).toBe(0.1);
  expect(
    journalQualifiedForecasts({
      assessments: [{ ...source, role: "refresh" }],
      modelPicks: [],
      bets: [],
      snapshots: [close],
    }).assessments,
  ).toEqual([]);
  expect(laterNoVigBaseline({ ...input, cutoffAt: close.observedAt })).toBeNull();
  expect(laterNoVigBaseline({ ...input, kickoffAt: close.observedAt })).toBeNull();
  expect(laterNoVigBaseline({ ...input, offer: { ...offer, pointLine: -3.5 } })).toBeNull();
  expect(
    laterNoVigBaseline({
      ...input,
      snapshots: [{ ...close, offers: [close.offers[0]] as unknown as [Offer, Offer] }],
    }),
  ).toBeNull();
});

it("keeps missing denominators unavailable and cohorts explicit", () => {
  expect(descriptiveCohortMetrics("actual-bets", [], [])).toEqual({
    cohort: "actual-bets",
    rawSameContractPriceMovement: {
      available: false,
      reason: "missing-comparable-closes",
      denominator: 0,
    },
    twoSidedNoVigCalibration: {
      available: false,
      reason: "missing-qualified-forecast-outcomes",
      denominator: 0,
    },
  });
});

it("averages one raw movement per subject and scores frozen probabilities separately", () => {
  const metrics = descriptiveCohortMetrics(
    "primary-model-picks",
    [
      { id: "pick", difference: -0.1 },
      { id: "pick", difference: -0.2 },
      { id: "other", difference: 0.4 },
    ],
    [
      {
        id: "pick",
        probabilities: { win: 0.75, loss: 0.25, push: 0 },
        closingBaseline: { win: 0.5, loss: 0.5, push: 0 },
        outcome: "win",
      },
    ],
  );
  expect(metrics.rawSameContractPriceMovement).toEqual({
    available: true,
    denominator: 2,
    meanDecimalOddsChange: 0.1,
  });
  expect(metrics.twoSidedNoVigCalibration).toMatchObject({
    available: true,
    denominator: 1,
    model: { brier: 0.125, logLoss: -Math.log(0.75) },
    closing: { brier: 0.5, logLoss: -Math.log(0.5) },
    meanWinProbabilityDifference: 0.25,
    decisiveDenominator: 1,
    modelWinCalibrationBias: -0.25,
  });
});

it("scores a push in the bundle but keeps the win-rate bias decisive-only", () => {
  const metrics = descriptiveCohortMetrics(
    "primary-model-picks",
    [],
    [
      {
        id: "push",
        probabilities: { win: 0.3, loss: 0.2, push: 0.5 },
        closingBaseline: { win: 0.4, loss: 0.3, push: 0.3 },
        outcome: "push",
      },
    ],
  );
  const calibration = metrics.twoSidedNoVigCalibration;
  if (!calibration.available) throw new Error("expected an available calibration bundle");
  expect(calibration.denominator).toBe(1);
  expect(calibration.decisiveDenominator).toBe(0);
  expect(calibration.modelWinCalibrationBias).toBeNull();
  expect(calibration.model.brier).toBeGreaterThan(0);
  expect(calibration.closing.brier).toBeGreaterThan(0);
});
