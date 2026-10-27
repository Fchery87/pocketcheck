import { describe, expect, it } from "vite-plus/test";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runGameBoard, type GameBoardRequest } from "#lib/server/analysis/board-run.ts";
import { createMemoryStore } from "#lib/server/analysis/store.ts";
import type { EvidenceCollector } from "#lib/server/analysis/evidence.ts";
import { createArtifactForecast, createArtifactModel } from "#lib/server/analysis/model.ts";
import { quiet, scriptedModel } from "../../../../tests/board-fixtures.ts";

const NOW = "2026-10-25T16:00:00.000Z";
const game = loadFixtureGames("tests/fixtures/sources/games-minimized.csv", NOW).find(
  (item) => item.id === "2026_07_DAL_PHI",
)!;

function board(overrides: Partial<GameBoardRequest> = {}): GameBoardRequest {
  return {
    game,
    nowIso: NOW,
    sportsbook: "Reasons Book",
    observedAt: "2026-10-25T15:30:00.000Z",
    moneyline: { home: -110, away: -110, tieRule: "push" },
    ...overrides,
  };
}

describe("model pick drivers", () => {
  const paths = {
    artifactPath: "tests/fixtures/models/browser-forecasting-model.json",
    schedulePath: "tests/fixtures/sources/games-minimized.csv",
  };

  it("freezes what moved the margin and the total with the forecast", async () => {
    const store = createMemoryStore();
    const outcome = await runGameBoard(board({ requestId: "drivers-1" }), {
      store,
      collect: quiet,
      model: createArtifactModel(paths),
      forecast: createArtifactForecast(paths),
    });
    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    const saved = (await store.getBoard(outcome.board!.id))!;
    expect(saved).toEqual(outcome.board);
    const drivers = saved.markets[0].pick!.forecast!.drivers!;
    for (const part of [drivers.margin, drivers.total]) {
      expect(part.contributions.map((item) => item.feature)).toHaveLength(13);
    }
    // The pick's own forecast probabilities and the drivers come from one prediction: the
    // fixture model gives PHI no chance, which only a very large negative margin mean does.
    const effect = drivers.margin.contributions.reduce(
      (value, item) => value + item.points,
      drivers.margin.intercept,
    );
    expect(effect).toBeLessThan(-30);
  });

  it("freezes margin and total drivers for a spread and a total pick too", async () => {
    const store = createMemoryStore();
    const outcome = await runGameBoard(
      board({
        requestId: "drivers-2",
        spread: { homeLine: -3.5, awayLine: 3.5, home: -110, away: -110 },
        total: { overLine: 44.5, underLine: 44.5, over: -110, under: -110 },
      }),
      {
        store,
        collect: quiet,
        model: createArtifactModel(paths),
        forecast: createArtifactForecast(paths),
      },
    );
    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    for (const entry of outcome.board!.markets) {
      const drivers = entry.pick!.forecast!.drivers!;
      expect(drivers.margin.contributions).toHaveLength(13);
      expect(drivers.total.contributions).toHaveLength(13);
    }
    expect(outcome.board!.markets.map((entry) => entry.market)).toEqual([
      "moneyline",
      "spread",
      "total",
    ]);
  });
});

describe("manual evidence on a game board", () => {
  const missingBoth: EvidenceCollector = async () => ({
    items: [],
    gaps: ["Injury report was not collected.", "Weather was not collected."],
    materialGaps: [
      { kind: "injury-report", text: "Injury report was not collected." },
      { kind: "weather", text: "Weather was not collected." },
    ],
  });
  const hoursBefore = (hours: number) =>
    new Date(Date.parse(NOW) - hours * 3_600_000).toISOString();
  const strongModel = () =>
    scriptedModel({
      home: { win: 0.62, loss: 0.38, push: 0 },
      conservativeHome: { win: 0.58, loss: 0.42, push: 0 },
    });
  const injury = (sourceTime: string, extra: { team?: string } = {}) => ({
    text: "Both clubs list no starters out.",
    url: "",
    sourceTime,
    covers: "injury-report" as const,
    team: "PHI",
    ...extra,
  });
  const weather = (sourceTime: string) => ({
    text: "Kickoff 52F, wind 8 mph.",
    url: "",
    sourceTime,
    covers: "weather" as const,
  });
  const run = (request: Partial<GameBoardRequest>) =>
    runGameBoard(board(request), {
      store: createMemoryStore(),
      collect: missingBoth,
      model: strongModel(),
    });

  it("caps the grade at lean while material evidence is missing", async () => {
    const outcome = await run({});
    const pick = outcome.board!.markets[0].pick!;
    expect(pick.calculation.sides[0].conservativeExpectedValue).toBeGreaterThan(0);
    expect(pick.calculation.grade).toBe("lean");
    expect(pick.calculation.materialEvidenceMissing).toBe(true);
    expect(outcome.board!.gaps).toEqual(
      expect.arrayContaining(["Injury report was not collected.", "Weather was not collected."]),
    );
  });

  it("lets fresh tagged manual evidence clear the gaps and restore strong", async () => {
    const outcome = await run({
      manualEvidence: [injury(hoursBefore(3)), weather(hoursBefore(2))],
    });
    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    const saved = outcome.board!;
    const pick = saved.markets[0].pick!;
    expect(pick.calculation.materialEvidenceMissing).toBe(false);
    expect(pick.calculation.grade).toBe("strong");
    const manual = saved.evidence.filter((item) => item.origin === "manual");
    expect(manual).toHaveLength(2);
    expect(manual[0].retrievedAt).toBe(NOW);
    expect(saved.gaps.join(" ")).toMatch(/injury report comes from manual evidence/);
    expect(saved.gaps.join(" ")).toMatch(/kickoff forecast comes from manual evidence/);
  });

  it("keeps the gap for late, stale, unrelated, or untimed evidence and says why", async () => {
    const cases = [
      { name: "dated after the cutoff", entry: weather("2026-10-26T12:00:00.000Z") },
      { name: "older than its window", entry: weather(hoursBefore(20)) },
      { name: "without a source time", entry: weather("unknown") },
    ];
    for (const item of cases) {
      const outcome = await run({ manualEvidence: [injury(hoursBefore(3)), item.entry] });
      const saved = outcome.board!;
      expect(saved.markets[0].pick!.calculation.grade, item.name).toBe("lean");
      expect(saved.markets[0].pick!.calculation.materialEvidenceMissing, item.name).toBe(true);
    }
    const late = await run({
      manualEvidence: [injury(hoursBefore(3)), weather("2026-10-26T12:00:00.000Z")],
    });
    expect(late.board!.gaps.join(" ")).toMatch(/1 evidence item dated after the decision cutoff/);
    expect(late.board!.gaps.join(" ")).toContain("Kickoff 52F, wind 8 mph.");
    expect(late.board!.evidence.filter((item) => item.origin === "manual")).toHaveLength(1);
    const stale = await run({ manualEvidence: [injury(hoursBefore(3)), weather(hoursBefore(20))] });
    expect(stale.board!.gaps.join(" ")).toMatch(/20 hours old; the kickoff forecast needs one/);
    const untimed = await run({ manualEvidence: [injury(hoursBefore(3)), weather("unknown")] });
    expect(untimed.board!.gaps.join(" ")).toMatch(/has no source time/);
  });

  it("does not let another team's injury report clear a team's coverage", async () => {
    const collect: EvidenceCollector = async () => ({
      items: [],
      gaps: ["PHI week 7 injury coverage is not established."],
      materialGaps: [{ kind: "injury-report", team: "PHI", text: "PHI coverage unknown." }],
    });
    const outcome = await runGameBoard(
      board({ manualEvidence: [injury(hoursBefore(3), { team: "DAL" })] }),
      { store: createMemoryStore(), collect, model: strongModel() },
    );
    const saved = outcome.board!;
    expect(saved.markets[0].pick!.calculation.grade).toBe("lean");
    expect(saved.gaps.join(" ")).toMatch(/not for PHI, so it does not clear that team's coverage/);
  });

  it("refuses manual evidence with neither text nor a link without saving a board", async () => {
    const store = createMemoryStore();
    const outcome = await runGameBoard(
      board({ manualEvidence: [{ text: " ", url: "", sourceTime: "unknown" }] }),
      { store, collect: quiet },
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.board).toBeUndefined();
  });
});

describe("private lean on a game board", () => {
  const LEAN = "I like Dallas on the road, fade the Eagles' secondary";
  const RATIONALE = "Watched the last three games closely";

  it("is saved with the board and nowhere in the forecast, evidence, or model pick", async () => {
    const store = createMemoryStore();
    const outcome = await runGameBoard(
      board({ requestId: "lean-1", lean: LEAN, rationale: RATIONALE }),
      {
        store,
        collect: quiet,
        model: scriptedModel({ home: { win: 0.6, loss: 0.4, push: 0 } }),
        forecast: async (_game, _cutoff, _offer, model) =>
          model.status === "computed"
            ? {
                version: 1,
                provenance: "captured",
                decisionCutoff: NOW,
                inputAvailability: { version: "v", results: "r", starters: "s" },
                artifact: { checksum: model.artifact.checksum, version: 4 },
                features: {},
                starters: {
                  home: { state: "unknown", identity: null, evidenceAt: null },
                  away: { state: "unknown", identity: null, evidenceAt: null },
                },
                marketEligibility: { market: "moneyline", eligible: false },
                probabilities: model.probabilities,
                uncertainty: model.uncertainty,
                policyVersion: "p",
              }
            : null,
      },
    );
    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    const saved = (await store.getBoard(outcome.board!.id))!;
    expect(saved.lean).toEqual({ text: LEAN, rationale: RATIONALE });
    const { lean: _lean, ...everythingElse } = saved;
    expect(JSON.stringify(everythingElse)).not.toContain("Dallas on the road");
    expect(JSON.stringify(everythingElse)).not.toContain("three games closely");
    expect(saved.markets[0].pick!.forecast).not.toBeNull();
  });

  it("stays null when none is entered and does not change the pick", async () => {
    const withLean = await runGameBoard(board({ requestId: "lean-a", lean: LEAN }), {
      store: createMemoryStore(),
      collect: quiet,
      model: scriptedModel({ home: { win: 0.6, loss: 0.4, push: 0 } }),
    });
    const without = await runGameBoard(board({ requestId: "lean-b" }), {
      store: createMemoryStore(),
      collect: quiet,
      model: scriptedModel({ home: { win: 0.6, loss: 0.4, push: 0 } }),
    });
    expect(without.board!.lean).toBeNull();
    expect(withLean.board!.markets[0].pick!.calculation).toEqual(
      without.board!.markets[0].pick!.calculation,
    );
  });

  it("is part of what identifies a submission", async () => {
    const store = createMemoryStore();
    const first = await runGameBoard(board({ requestId: "lean-c", lean: LEAN }), {
      store,
      collect: quiet,
    });
    expect(first.ok).toBe(true);
    const changed = await runGameBoard(board({ requestId: "lean-c", lean: "Take Philadelphia" }), {
      store,
      collect: quiet,
    });
    expect(changed.ok).toBe(false);
    expect(changed.ok ? "" : changed.error).toMatch(/different inputs/);
  });
});
