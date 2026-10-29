import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { parseOffer, type Offer } from "#lib/domain/offer.ts";
import { withChecksum, type ModelArtifact } from "#lib/server/models/artifact.ts";
import { FEATURE_DEFINITIONS } from "#lib/server/models/features.ts";
import { predictMean } from "#lib/server/models/fit.ts";
import { releaseArtifact } from "#lib/server/models/release.ts";
import {
  evaluateProspectiveForecasts,
  protocolForArtifact,
  type FrozenForecastRecord,
} from "#lib/server/models/prospective.ts";
import { fitArtifact } from "#lib/server/models/train.ts";
import type { ScheduledGame } from "#lib/server/sources/contracts.ts";
import { createArtifactForecast, createArtifactModel, forDisplay, noModel } from "./model.ts";

const HEADER =
  "game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location,result,total,overtime,old_game_id,gsis,nfl_detail_id,pfr,pff,espn,ftn,away_rest,home_rest,away_moneyline,home_moneyline,spread_line,away_spread_odds,home_spread_odds,total_line,under_odds,over_odds,div_game,roof,surface,temp,wind,away_qb_id,home_qb_id,away_qb_name,home_qb_name,away_coach,home_coach,referee,stadium_id,stadium";

type Row = {
  id: string;
  day: string;
  home: string;
  away: string;
  scores?: [number, number];
};

function csv(rows: Row[]): string {
  const columns = HEADER.split(",");
  const lines = rows.map((row) => {
    const values: Record<string, string> = {
      game_id: row.id,
      season: "2024",
      gameday: row.day,
      gametime: "13:00",
      home_team: row.home,
      away_team: row.away,
      home_score: row.scores ? String(row.scores[0]) : "",
      away_score: row.scores ? String(row.scores[1]) : "",
      location: "Home",
      home_qb_id: `${row.home}-qb`,
      away_qb_id: `${row.away}-qb`,
    };
    return columns.map((column) => values[column] ?? "").join(",");
  });
  return [HEADER, ...lines].join("\n");
}

// Ten teams, 60 finished games through November, then one upcoming game in December.
const finished: Row[] = Array.from({ length: 60 }, (_, index) => {
  const day = new Date(Date.UTC(2024, 8, 5) + index * 86_400_000).toISOString().slice(0, 10);
  const home = `T${index % 10}`;
  const away = `T${(index * 3 + 1) % 10 === index % 10 ? (index + 1) % 10 : (index * 3 + 1) % 10}`;
  return {
    id: `g${index}`,
    day,
    home,
    away,
    scores: [17 + (index % 10), 14 + ((index * 7) % 13)],
  };
});
const upcomingRow: Row = {
  id: "next",
  day: "2024-12-08",
  home: "T1",
  away: "T2",
};

const game: ScheduledGame = {
  id: "next",
  season: 2024,
  week: 14,
  home: "T1",
  away: "T2",
  kickoff: "2024-12-08T18:00:00.000Z",
  venue: { name: "Field", stadiumId: "F", roof: "outdoors" },
  finalScore: null,
  scheduleSpread: null,
};
const CUTOFF = "2024-12-07T12:00:00.000Z";

function spreadOffer(selection: "home" | "away", pointLine: number): Offer {
  return parseOffer({
    gameId: "next",
    sportsbook: "Book",
    market: "spread",
    selection,
    pointLine,
    americanOdds: -110,
    observedAt: "2024-12-07T11:00:00.000Z",
    kickoffAt: game.kickoff,
    rules: { period: "full-game", overtime: "included" },
    opposing: {
      sportsbook: "Book",
      pointLine: -pointLine,
      americanOdds: -110,
      observedAt: "2024-12-07T11:00:00.000Z",
    },
  });
}

const directory = mkdtempSync(join(tmpdir(), "pocketcheck-model-"));
const schedulePath = join(directory, "games.csv");
writeFileSync(schedulePath, csv([...finished, upcomingRow]));
const trainingGames = finished.map((row) => ({
  id: row.id,
  kickoff: `${row.day}T17:00:00.000Z`,
  home: row.home,
  away: row.away,
  homeScore: row.scores![0],
  awayScore: row.scores![1],
  prices: {
    spread: { line: -3, home: { american: -110 }, away: { american: -110 } },
    total: { line: 44, over: { american: -110 }, under: { american: -110 } },
  },
}));
const artifact = fitArtifact(trainingGames, "2024-10-15T00:00:00.000Z");

function saved(name: string, value: ModelArtifact): string {
  const path = join(directory, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

describe("the model a run uses", () => {
  it("says no model is configured by default", async () => {
    expect(await noModel(game, CUTOFF, spreadOffer("home", -3))).toEqual({
      status: "unavailable",
      reason: "No model artifact is configured.",
    });
  });

  it("explains a missing artifact file", async () => {
    const model = createArtifactModel({
      artifactPath: join(directory, "none.json"),
      schedulePath,
    });
    const result = await model(game, CUTOFF, spreadOffer("home", -3));
    expect(result).toMatchObject({ status: "unavailable" });
    expect(result.status === "unavailable" && result.reason).toMatch(/npm run model:fit/);
  });

  it("returns an unavailable model for malformed artifacts even with matching checksums", async () => {
    const { checksum: _checksum, ...body } = artifact;
    const malformed = [
      null,
      [],
      {
        ...body,
        margin: {
          ...body.margin,
          model: { ...body.margin.model, intercept: null },
        },
      },
      { ...body, baseRates: { moneyline: { win: 1, loss: 1, push: 0 } } },
      {
        ...body,
        uncertainty: { ...body.uncertainty, markets: { moneyline: [] } },
      },
      { ...body, trainingCutoff: "invalid" },
      {
        ...body,
        featureParameters: { ...body.featureParameters, priorWeight: 0 },
      },
      { ...body, fitParameters: { ...body.fitParameters, residualFolds: -1 } },
      {
        ...body,
        margin: {
          ...body.margin,
          residuals: { ...body.margin.residuals, support: { min: 3, max: -3 } },
        },
      },
      { ...body, releaseStatus: "released-experimental", releasedMarkets: [] },
    ];
    for (const [index, value] of malformed.entries()) {
      const path = join(directory, `invalid-${index}.json`);
      writeFileSync(
        path,
        JSON.stringify(
          value === null || Array.isArray(value)
            ? value
            : {
                ...value,
                checksum: createHash("sha256").update(JSON.stringify(value)).digest("hex"),
              },
        ),
      );
      const result = await createArtifactModel({
        artifactPath: path,
        schedulePath,
      })(game, CUTOFF, spreadOffer("home", -3));
      expect(result).toMatchObject({
        status: "unavailable",
        reason: expect.stringMatching(/artifact/i),
      });
      expect(result).not.toHaveProperty("probabilities");
      expect(forDisplay(result)).toEqual(result);
    }
    const path = join(directory, "invalid-json.json");
    writeFileSync(path, "{broken");
    await expect(
      createArtifactModel({ artifactPath: path, schedulePath })(
        game,
        CUTOFF,
        spreadOffer("home", -3),
      ),
    ).resolves.toMatchObject({ status: "unavailable" });
  });

  it("rejects unsupported chronology metadata even with a valid checksum", async () => {
    const { checksum: _checksum, ...body } = artifact;
    for (const patch of [
      { version: "unknown" },
      { fallback: "immediate" },
      { cutoff: "inclusive" },
      { kickoffGroups: "split" },
    ]) {
      const value = {
        ...body,
        chronology: {
          version: "result-availability-v1",
          fallback: "kickoff-plus-24-hours",
          cutoff: "strictly-before",
          kickoffGroups: "intact",
          ...patch,
        },
      };
      const path = join(directory, "unsupported-chronology.json");
      writeFileSync(
        path,
        JSON.stringify({
          ...value,
          checksum: createHash("sha256").update(JSON.stringify(value)).digest("hex"),
        }),
      );
      const result = await createArtifactModel({
        artifactPath: path,
        schedulePath,
      })(game, CUTOFF, spreadOffer("home", -3));
      expect(result).toMatchObject({
        status: "unavailable",
        reason: expect.stringMatching(/chronology/),
      });
    }
  });

  it("refuses an artifact whose checksum does not match", async () => {
    const tampered = saved("tampered.json", {
      ...artifact,
      trainingCutoff: "2024-11-30T00:00:00Z",
    });
    const result = await createArtifactModel({
      artifactPath: tampered,
      schedulePath,
    })(game, CUTOFF, spreadOffer("home", -3));
    expect(result.status === "unavailable" && result.reason).toMatch(/checksum/);
  });

  it("refuses an artifact from an older version, whose features no longer match", async () => {
    const { checksum: _checksum, ...body } = artifact;
    const old = withChecksum({ ...body, version: 2 } as unknown as Omit<ModelArtifact, "checksum">);
    const result = await createArtifactModel({
      artifactPath: saved("old.json", old),
      schedulePath,
    })(game, CUTOFF, spreadOffer("home", -3));
    expect(result.status === "unavailable" && result.reason).toMatch(/version 2 is not supported/);
  });

  it("refuses an artifact trained on games through this one", async () => {
    const early = { ...game, kickoff: "2024-10-01T17:00:00.000Z" };
    const result = await createArtifactModel({
      artifactPath: saved("plain.json", artifact),
      schedulePath,
    })(early, "2024-09-30T12:00:00.000Z", spreadOffer("home", -3));
    expect(result.status === "unavailable" && result.reason).toMatch(/trained on games through/);
  });

  it("refuses an artifact trained after the research decision cutoff", async () => {
    const result = await createArtifactModel({
      artifactPath: saved("future-training.json", artifact),
      schedulePath,
    })(game, "2024-10-01T12:00:00.000Z", spreadOffer("home", -3));
    expect(result).toMatchObject({
      status: "unavailable",
      reason: expect.stringMatching(/decision cutoff/),
    });
    expect(result).not.toHaveProperty("probabilities");
  });

  it("records the offer's probabilities and why an unreleased market is not eligible", async () => {
    const result = await createArtifactModel({
      artifactPath: saved("plain.json", artifact),
      schedulePath,
    })(game, CUTOFF, spreadOffer("home", -3));
    if (result.status !== "computed") throw new Error(result.reason);
    const { win, loss, push } = result.probabilities;
    expect(win + loss + push).toBeCloseTo(1, 10);
    expect(result.artifact).toEqual({
      checksum: artifact.checksum,
      version: 6,
      trainingCutoff: artifact.trainingCutoff,
      releaseStatus: "unreleased",
      releasedMarkets: [],
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/Unreleased/);
    expect(result.protocol).toMatchObject({
      id: "prospective-2026-10-26",
      role: "independent",
    });
    expect(result.protocol.blockingReason).toMatch(/independent prospective evidence is missing/);
    expect(result.uncertainty).toMatchObject({ available: false });
    expect(!result.uncertainty.available && result.uncertainty.reason).toMatch(/fewer than 60/);
    const path = saved("plain.json", artifact);
    const forecast = await createArtifactForecast({
      artifactPath: path,
      schedulePath,
    })(game, CUTOFF, spreadOffer("home", -3), result);
    // 2024 depth charts carry no timestamp, so each starter is the team's most frequent recent one.
    for (const side of ["home", "away"] as const) {
      expect(forecast?.starters[side]).toMatchObject({
        state: "assumed",
        source: "recent starts",
        identity: expect.stringMatching(/-qb$/),
        evidenceAt: expect.any(String),
      });
      expect(Date.parse(forecast!.starters[side].evidenceAt!)).toBeLessThan(Date.parse(CUTOFF));
    }
    expect(forecast?.marketEligibility.eligible).toBe(false);
    expect(forecast?.artifact.checksum).toBe(artifact.checksum);
    // The frozen forecast records what moved the margin and the total, in points.
    const row = {
      gameId: "next",
      kickoff: game.kickoff,
      features: forecast!.features,
    } as never;
    for (const [name, model] of [
      ["margin", artifact.margin.model],
      ["total", artifact.total.model],
    ] as const) {
      const drivers = forecast!.drivers![name];
      expect(drivers.contributions).toHaveLength(FEATURE_DEFINITIONS.length);
      const sum = drivers.contributions.reduce(
        (value, item) => value + item.points,
        drivers.intercept,
      );
      expect(sum).toBeCloseTo(predictMean(model, row), 9);
    }
  });

  it("is eligible only for a market released by the prospective protocol", async () => {
    const savedProbability = { win: 0.7, loss: 0.3, push: 0 };
    const closing = { win: 0.4, loss: 0.6, push: 0 };
    const frozen = (market: "moneyline" | "spread"): FrozenForecastRecord[] =>
      Array.from({ length: 500 }, (_, index) => ({
        id: `${market}-${index}`,
        decisionCutoff: "2026-11-01T17:00:00Z",
        artifactChecksum: artifact.checksum,
        market,
        probabilities: savedProbability,
        closingBaseline: closing,
        executableOfferAt: "2026-11-01T16:00:00Z",
        slate: `slate-${index % 20}`,
        outcome: "win" as const,
      }));
    const protocol = protocolForArtifact(artifact.checksum);
    const emptyMarket = {
      assessed: 0,
      candidates: 0,
      decisive: 0,
      wins: 0,
      observedRate: null,
      meanBreakEven: null,
      interval: null,
    };
    const report = {
      version: 1 as const,
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
            moneyline: emptyMarket,
            spread: emptyMarket,
            total: emptyMarket,
          },
        },
      },
    };
    const releasedFor = (market: "moneyline" | "spread") => {
      const evaluation = evaluateProspectiveForecasts(protocol, frozen(market));
      return releaseArtifact(artifact, report, { protocol, evaluation });
    };
    const spread = await createArtifactModel({
      artifactPath: saved("spread.json", releasedFor("spread")),
      schedulePath,
    })(game, CUTOFF, spreadOffer("home", -3));
    expect(spread).toMatchObject({
      status: "computed",
      eligible: true,
      protocol: { id: "prospective-2026-10-26" },
    });
    const moneylineOnly = await createArtifactModel({
      artifactPath: saved("moneyline.json", releasedFor("moneyline")),
      schedulePath,
    })(game, CUTOFF, spreadOffer("home", -3));
    expect(moneylineOnly).toMatchObject({
      status: "computed",
      eligible: false,
      protocol: { id: "prospective-2026-10-26" },
    });
    if (moneylineOnly.status === "computed") {
      expect(moneylineOnly.protocol.blockingReason).toMatch(/has not released the spread/);
    }
  });

  it("prices the same bet the same way from either side", async () => {
    const model = createArtifactModel({
      artifactPath: saved("plain.json", artifact),
      schedulePath,
    });
    const home = await model(game, CUTOFF, spreadOffer("home", -3));
    const away = await model(game, CUTOFF, spreadOffer("away", 3));
    if (home.status !== "computed" || away.status !== "computed") throw new Error("not computed");
    expect(away.probabilities.win).toBeCloseTo(home.probabilities.loss, 10);
    expect(away.probabilities.push).toBeCloseTo(home.probabilities.push, 10);
  });

  it("ignores results recorded after the decision cutoff", async () => {
    const leakyPath = join(directory, "leaky.csv");
    writeFileSync(
      leakyPath,
      csv([
        ...finished,
        {
          id: "late",
          day: "2024-12-07",
          home: "T1",
          away: "T9",
          scores: [70, 0],
        },
        upcomingRow,
      ]),
    );
    const artifactPath = saved("plain.json", artifact);
    const clean = await createArtifactModel({ artifactPath, schedulePath })(
      game,
      "2024-12-07T12:00:00.000Z",
      spreadOffer("home", -3),
    );
    const leaky = await createArtifactModel({
      artifactPath,
      schedulePath: leakyPath,
    })(game, "2024-12-07T12:00:00.000Z", spreadOffer("home", -3));
    expect(leaky).toEqual(clean);
  });
});

describe("what the report page receives", () => {
  const recorded = {
    status: "computed" as const,
    artifact: {
      checksum: "e".repeat(64),
      version: 2,
      trainingCutoff: "2022-03-01T00:00:00Z",
      releaseStatus: "unreleased" as const,
      releasedMarkets: [],
    },
    probabilities: { win: 0.406, loss: 0.511, push: 0.083 },
    uncertainty: {
      available: true as const,
      confidence: 0.9,
      probabilities: { win: 0.39, loss: 0.527, push: 0.083 },
    },
    eligible: false,
    reason: "Unreleased artifacts are not eligible for a value recommendation.",
    protocol: {
      id: "prospective-2026-10-26",
      role: "independent" as const,
      blockingReason:
        "prospective-2026-10-26 blocks release: independent prospective evidence is missing.",
    },
  };

  it("leaves out an ineligible model's probabilities", () => {
    const shown = forDisplay(recorded);
    expect(shown).toEqual({
      ...recorded,
      probabilities: null,
      uncertainty: {
        available: false,
        reason: "Not shown: the market is not eligible.",
      },
    });
    const serialized = JSON.stringify(shown);
    expect(serialized).not.toContain("0.406");
    expect(serialized).not.toContain("0.39");
  });

  it("keeps an eligible model's probabilities and passes other states through", () => {
    expect(forDisplay({ ...recorded, eligible: true })).toEqual({
      ...recorded,
      eligible: true,
    });
    const missing = {
      status: "unavailable" as const,
      reason: "No model artifact is configured.",
    };
    expect(forDisplay(missing)).toEqual(missing);
    expect(forDisplay(null)).toBeNull();
  });
});
