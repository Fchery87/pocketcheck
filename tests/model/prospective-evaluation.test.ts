import { describe, expect, it } from "vite-plus/test";
import {
  artifactChecksum,
  valueEligibility,
} from "../../src/lib/server/models/artifact.ts";
import {
  evaluateProspectiveForecasts,
  protocolForArtifact,
  type FrozenForecastRecord,
} from "../../src/lib/server/models/prospective.ts";
import {
  releaseArtifact,
  releaseUnderProtocol,
} from "../../src/lib/server/models/release.ts";
import { fitArtifact } from "../../src/lib/server/models/train.ts";
import type { PricedGame } from "../../src/lib/server/models/games.ts";
import { readFileSync } from "node:fs";

const saved = { win: 0.7, loss: 0.3, push: 0 };
const close = { win: 0.4, loss: 0.6, push: 0 };
const worse = { win: 0.2, loss: 0.8, push: 0 };

function record(
  index: number,
  checksum: string,
  overrides: Partial<FrozenForecastRecord> = {},
): FrozenForecastRecord {
  return {
    id: `g${index}`,
    decisionCutoff: "2026-11-01T17:00:00Z",
    artifactChecksum: checksum,
    market: "moneyline",
    probabilities: saved,
    closingBaseline: close,
    executableOfferAt: "2026-11-01T16:00:00Z",
    slate: `slate-${index % 20}`,
    outcome: "win",
    ...overrides,
  };
}

function records(
  count: number,
  checksum: string,
  overrides: Partial<FrozenForecastRecord> = {},
) {
  return Array.from({ length: count }, (_, index) =>
    record(index, checksum, overrides),
  );
}

const games = JSON.parse(
  readFileSync(
    new URL("./fixtures/synthetic-games.json", import.meta.url),
    "utf8",
  ),
).games as PricedGame[];
const artifact = fitArtifact(games, "2024-09-15T20:00:00Z");

describe("prospective evaluation of frozen forecasts", () => {
  it("scores the saved probabilities and does not treat a timestamped offer as the close", () => {
    const protocol = protocolForArtifact(artifact.checksum);
    const evaluation = evaluateProspectiveForecasts(protocol, [
      record(0, artifact.checksum, {
        closingBaseline: null,
        executableOfferAt: "2026-11-01T16:00:00Z",
      }),
      record(1, artifact.checksum),
    ]);
    expect(evaluation.profitability).toBeNull();
    expect(evaluation.missingObservations).toBe(1);
    expect(evaluation.markets.moneyline.pricedGames).toBe(1);
    expect(evaluation.markets.moneyline.model?.logLoss).toBeCloseTo(
      -Math.log(0.7),
      6,
    );
    expect(evaluation.markets.moneyline.release.released).toBe(false);
    expect(evaluation.markets.moneyline.release.reason).toMatch(
      /fewer than 500/,
    );
    expect(evaluation.markets.moneyline.provenance).toBe(
      "frozen-decision-time-forecasts",
    );
  });

  it("blocks a worse saved forecast even when the sample is large", () => {
    const protocol = protocolForArtifact(artifact.checksum);
    const evaluation = evaluateProspectiveForecasts(
      protocol,
      records(500, artifact.checksum, { probabilities: worse }),
    );
    expect(evaluation.markets.moneyline.release.released).toBe(false);
    expect(evaluation.markets.moneyline.release.reason).toMatch(
      /worse than the close/,
    );
  });

  it("releases only the market whose frozen forecasts meet the protocol, without claiming profit", () => {
    const protocol = protocolForArtifact(artifact.checksum);
    const evaluation = evaluateProspectiveForecasts(
      protocol,
      records(500, artifact.checksum),
    );
    expect(evaluation.markets.moneyline.release.released).toBe(true);
    expect(evaluation.markets.moneyline.release.reason).toMatch(
      /not a profitability claim/,
    );
    expect(evaluation.markets.spread.release.released).toBe(false);
    expect(evaluation.markets.spread.release.reason).toMatch(/missing metrics/);
    const decision = releaseUnderProtocol({
      artifact,
      protocol,
      development: null,
      prospective: evaluation,
    });
    expect(decision.released).toBe(true);
    expect(decision.profitability).toBeNull();
    expect(decision.markets.moneyline.released).toBe(true);
    expect(decision.markets.spread.released).toBe(false);
    const released = releaseArtifact(
      artifact,
      {
        version: 1,
        datasetHash: artifact.datasetHash,
        trainingCutoff: artifact.trainingCutoff,
        holdoutGames: 0,
        artifactChecksum: artifact.checksum,
        summary: {
          count: 0,
          brier: 0,
          logLoss: 0,
          calibration: [],
          baselines: [],
          coverage: { priced: 0, missingPrices: 0 },
          byMarket: {},
          threshold: {
            version: "threshold-2026-10-25",
            conservativeExpectedValue: 0,
            note: "",
            markets: {
              moneyline: {
                assessed: 0,
                candidates: 0,
                decisive: 0,
                wins: 0,
                observedRate: null,
                meanBreakEven: null,
                interval: null,
              },
              spread: {
                assessed: 0,
                candidates: 0,
                decisive: 0,
                wins: 0,
                observedRate: null,
                meanBreakEven: null,
                interval: null,
              },
              total: {
                assessed: 0,
                candidates: 0,
                decisive: 0,
                wins: 0,
                observedRate: null,
                meanBreakEven: null,
                interval: null,
              },
            },
          },
        },
      },
      { protocol, evaluation },
    );
    expect(released.releaseStatus).toBe("released-experimental");
    expect(released.releasedMarkets).toEqual(["moneyline"]);
    const { checksum, ...body } = released;
    expect(artifactChecksum(body)).toBe(checksum);
    expect(valueEligibility(released, "moneyline").eligible).toBe(true);
    expect(artifact.releaseStatus).toBe("unreleased");
  });

  it("rejects a different artifact and a changed protocol identity", () => {
    const protocol = protocolForArtifact(artifact.checksum);
    const evaluation = evaluateProspectiveForecasts(
      protocol,
      records(500, "f".repeat(64)),
    );
    expect(evaluation.markets.moneyline.release.reason).toMatch(
      /different artifact/,
    );
    const changed = releaseUnderProtocol({
      artifact,
      protocol,
      development: null,
      prospective: { ...evaluation, protocolId: "prospective-tuned-later" },
    });
    expect(changed.released).toBe(false);
    expect(changed.reasons.join(" ")).toMatch(/new protocol identity/);
  });

  it("keeps the saved prediction when the current score and close would tell a different story", () => {
    const protocol = protocolForArtifact(artifact.checksum);
    const frozen = records(2, artifact.checksum);
    const before = evaluateProspectiveForecasts(protocol, frozen);
    const replayed = frozen.map((row) => ({
      ...row,
      outcome: "loss" as const,
    }));
    const after = evaluateProspectiveForecasts(protocol, replayed);
    expect(before.markets.moneyline.model?.logLoss).toBeCloseTo(
      -Math.log(0.7),
      6,
    );
    expect(after.markets.moneyline.model?.logLoss).toBeCloseTo(
      -Math.log(0.3),
      6,
    );
    expect(replayed[0]?.probabilities).toEqual(saved);
  });
});
