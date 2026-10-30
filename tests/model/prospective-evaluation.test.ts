import { describe, expect, it } from "vite-plus/test";
import {
  evaluateProspectiveForecasts,
  protocolForArtifact,
  type FrozenForecastRecord,
} from "../../src/lib/server/models/prospective.ts";
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

function records(count: number, checksum: string, overrides: Partial<FrozenForecastRecord> = {}) {
  return Array.from({ length: count }, (_, index) => record(index, checksum, overrides));
}

const games = JSON.parse(
  readFileSync(new URL("./fixtures/synthetic-games.json", import.meta.url), "utf8"),
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
    expect(evaluation.markets.moneyline.model?.logLoss).toBeCloseTo(-Math.log(0.7), 6);
    expect(evaluation.markets.moneyline.release.released).toBe(false);
    expect(evaluation.markets.moneyline.release.reason).toMatch(/fewer than 500/);
    expect(evaluation.markets.moneyline.provenance).toBe("frozen-decision-time-forecasts");
  });

  it("blocks a worse saved forecast even when the sample is large", () => {
    const protocol = protocolForArtifact(artifact.checksum);
    const evaluation = evaluateProspectiveForecasts(
      protocol,
      records(500, artifact.checksum, { probabilities: worse }),
    );
    expect(evaluation.markets.moneyline.release.released).toBe(false);
    expect(evaluation.markets.moneyline.release.reason).toMatch(/worse than the close/);
  });

  it("computes diagnostic scores without changing the artifact", () => {
    const protocol = protocolForArtifact(artifact.checksum);
    const evaluation = evaluateProspectiveForecasts(protocol, records(500, artifact.checksum));
    expect(evaluation.markets.moneyline.release.released).toBe(true);
    expect(evaluation.markets.moneyline.release.reason).toMatch(/not a profitability claim/);
    expect(evaluation.markets.spread.release.released).toBe(false);
    expect(evaluation.markets.spread.release.reason).toMatch(/missing metrics/);
  });

  it("rejects a different artifact", () => {
    const protocol = protocolForArtifact(artifact.checksum);
    const evaluation = evaluateProspectiveForecasts(protocol, records(500, "f".repeat(64)));
    expect(evaluation.markets.moneyline.release.reason).toMatch(/different artifact/);
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
    expect(before.markets.moneyline.model?.logLoss).toBeCloseTo(-Math.log(0.7), 6);
    expect(after.markets.moneyline.model?.logLoss).toBeCloseTo(-Math.log(0.3), 6);
    expect(replayed[0]?.probabilities).toEqual(saved);
  });
});
