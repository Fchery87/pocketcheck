import { describe, expect, it } from "vite-plus/test";
import { loadFixtureGames } from "#lib/server/analysis/games.ts";
import { runGameBoard, type GameBoardRequest } from "#lib/server/analysis/board-run.ts";
import { createFixtureDrafter } from "#lib/server/analysis/fixture-drafter.ts";
import { createMemoryStore, type JournalStore } from "#lib/server/analysis/store.ts";
import type {
  DraftPickExplanationResult,
  PickDrafter,
  PickExplanationPacket,
  PickExplanationReport,
  ProviderRequestRecord,
} from "#lib/server/providers/contracts.ts";
import { quiet, scriptedModel } from "../../../../tests/board-fixtures.ts";

const NOW = "2026-10-25T16:00:00.000Z";
const game = loadFixtureGames("tests/fixtures/sources/games-minimized.csv", NOW).find(
  (item) => item.id === "2026_07_DAL_PHI",
)!;

function board(overrides: Partial<GameBoardRequest> = {}): GameBoardRequest {
  return {
    game,
    nowIso: NOW,
    sportsbook: "Board Book",
    observedAt: "2026-10-25T15:30:00.000Z",
    moneyline: { home: -150, away: 130, tieRule: "push" },
    ...overrides,
  };
}

const model = () => scriptedModel({ home: { win: 0.62, loss: 0.36, push: 0.02 } });

type Drafted = (packet: PickExplanationPacket) => Promise<DraftPickExplanationResult>;

/** A drafter that records every packet it receives and answers with `answer`. */
function scripted(answer: Drafted): PickDrafter & { packets: PickExplanationPacket[] } {
  const packets: PickExplanationPacket[] = [];
  return {
    id: "scripted",
    modelId: "scripted-model",
    packets,
    async draftPickExplanation({ packet }) {
      packets.push(packet);
      return answer(packet);
    },
  };
}

async function fixtureAnswer(packet: PickExplanationPacket): Promise<DraftPickExplanationResult> {
  return createFixtureDrafter().draftPickExplanation({
    modelId: "fixture-drafter",
    catalog: [],
    packet,
  });
}

function request(
  id: string,
  role: "draft" | "repair",
  patch: Partial<ProviderRequestRecord> = {},
): ProviderRequestRecord {
  return {
    requestId: id,
    role,
    outcome: "completed",
    response: null,
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    costUsd: 0.01,
    costKnown: true,
    ...patch,
  };
}

function withReport(
  base: DraftPickExplanationResult,
  change: (report: PickExplanationReport) => void,
  patch: Partial<DraftPickExplanationResult> = {},
): DraftPickExplanationResult {
  const report = structuredClone(base.report!);
  change(report);
  return { ...base, report, ...patch };
}

const run = (
  store: JournalStore,
  drafter: PickDrafter,
  overrides: Partial<GameBoardRequest> = {},
) => runGameBoard(board(overrides), { store, collect: quiet, model: model(), drafter });

describe("pick explanation", () => {
  it("saves the fixture drafter's explanation beside the frozen pick", async () => {
    const store = createMemoryStore();
    const outcome = await runGameBoard(board({ requestId: "fixture" }), {
      store,
      collect: quiet,
      model: model(),
      drafter: createFixtureDrafter(),
    });
    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    if (!outcome.ok) return;
    const saved = (await store.getBoard(outcome.board.id))!;
    expect(saved.drafter).toEqual({ id: "fixture", modelId: "fixture-drafter" });
    const pick = saved.markets[0]!.pick!;
    expect(pick.calculation.pickedSelection).toBe("home");
    const [entry] = saved.explanation!.picks;
    expect(entry).toMatchObject({
      market: "moneyline",
      side: "home",
      grade: "lean",
      americanOdds: -150,
    });
    expect(entry!.summary).toContain("PHI");
    expect(entry!.otherSideCase.length).toBeGreaterThan(0);
    expect(entry!.claims.some((claim) => claim.stance === "opposing")).toBe(true);
    // Fixture drafter reports no provider usage, and that stays unknown.
    expect(saved.usage).toBeNull();
  });

  it("freezes the picks before drafting and keeps the private lean out of the packet", async () => {
    const store = createMemoryStore();
    let during: Awaited<ReturnType<typeof store.getBoard>> = null;
    const drafter = scripted(async (packet) => {
      during = await store.getBoard(boardId());
      return fixtureAnswer(packet);
    });
    const ids: string[] = [];
    const boardId = () => ids[0]!;
    const original = store.beginBoard.bind(store);
    store.beginBoard = async (input) => {
      const begun = await original(input);
      if (begun.kind === "created") ids.push(begun.board.id);
      return begun;
    };
    const outcome = await run(store, drafter, {
      requestId: "lean",
      lean: "SECRETLEAN take the dogs",
      rationale: "SECRETRATIONALE gut feeling",
      manualEvidence: [
        {
          text: "Starting quarterback is out",
          url: "https://example.com/news",
          sourceTime: "2026-10-25T15:00:00.000Z",
        },
      ],
    });
    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    expect(during!.status).toBe("running");
    expect(during!.markets[0]!.pick).not.toBeNull();
    expect(during!.explanation).toBeNull();
    const [packet] = drafter.packets;
    const text = JSON.stringify(packet);
    expect(text).not.toContain("SECRETLEAN");
    expect(text).not.toContain("SECRETRATIONALE");
    expect(packet!.picks).toHaveLength(1);
    expect(packet!.picks[0]).toMatchObject({
      market: "moneyline",
      grade: "lean",
      release: "unvalidated",
      picked: { selection: "home", label: "PHI", americanOdds: -150, modelWinProbability: 0.62 },
      other: { selection: "away", label: "DAL", americanOdds: 130 },
    });
    expect(packet!.items.map((item) => item.origin)).toContain("manual");
    expect(packet!.gaps).toEqual((await store.getBoard(boardId()))!.gaps);
  });

  it("does not draft a market without a model pick", async () => {
    const store = createMemoryStore();
    const drafter = scripted(fixtureAnswer);
    const outcome = await runGameBoard(board({ requestId: "none" }), {
      store,
      collect: quiet,
      drafter,
    });
    expect(outcome.ok).toBe(true);
    expect(drafter.packets).toHaveLength(0);
    if (outcome.ok) expect(outcome.board.explanation).toBeNull();
  });
});

describe("pick explanation contradictions", () => {
  it.each([
    ["a different side", (report: PickExplanationReport) => (report.picks[0]!.side = "away")],
    ["a different grade", (report: PickExplanationReport) => (report.picks[0]!.grade = "strong")],
    [
      "a different price",
      (report: PickExplanationReport) => (report.picks[0]!.americanOdds = -140),
    ],
    [
      "an invented percentage",
      (report: PickExplanationReport) => (report.picks[0]!.summary += " It wins 73% of the time."),
    ],
    [
      "an invented price",
      (report: PickExplanationReport) => (report.picks[0]!.summary += " A fair price is +175."),
    ],
    [
      "a literal price even when it matches",
      (report: PickExplanationReport) => (report.picks[0]!.summary += " The price is -150."),
    ],
    [
      "a spelled-out line",
      (report: PickExplanationReport) =>
        (report.picks[0]!.summary =
          "The forecasting model chose over ninety-nine and a half points."),
    ],
    [
      "an odds reference used as a line",
      (report: PickExplanationReport) =>
        (report.picks[0]!.summary = "The model chose a line of {{picked.odds}}."),
    ],
    [
      "the other side as the pick",
      (report: PickExplanationReport) => (report.picks[0]!.summary = "The model picks DAL here."),
    ],
    [
      "another grade in prose",
      (report: PickExplanationReport) => (report.picks[0]!.summary = "This is graded strong."),
    ],
    [
      "a cited evidence id that was not supplied",
      (report: PickExplanationReport) => (report.picks[0]!.claims[0]!.evidenceIds = ["made-up"]),
    ],
  ])("fails the run and keeps the board and pick when it names %s", async (_name, change) => {
    const store = createMemoryStore();
    const drafter = scripted(async (packet) => withReport(await fixtureAnswer(packet), change));
    const outcome = await run(store, drafter, { requestId: `contradict-${_name}` });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.board).toBeDefined();
    const saved = (await store.getBoard(outcome.board!.id))!;
    expect(saved.status).toBe("failed");
    expect(saved.explanation).toBeNull();
    expect(saved.failureReason).toMatch(/frozen|did not supply|not supplied|evidence id/);
    expect(saved.markets[0]!.pick!.calculation.pickedSelection).toBe("home");
    expect(saved.markets[0]!.pick!.calculation.grade).toBe("lean");
  });

  it("rejects provider-authored references to contract numbers", async () => {
    const store = createMemoryStore();
    const drafter = scripted(async (packet) =>
      withReport(
        await fixtureAnswer(packet),
        (report) =>
          (report.picks[0]!.summary =
            "{{picked.label}} is the pick at {{picked.odds}}, with the model near {{picked.win}} against a no-vig {{picked.noVig}}."),
      ),
    );
    const outcome = await run(store, drafter, { requestId: "supplied" });
    expect(outcome.ok).toBe(false);
  });

  it("renders references from the frozen pick and rejects unknown references", async () => {
    const store = createMemoryStore();
    const good = scripted(async (packet) =>
      withReport(await fixtureAnswer(packet), (report) => {
        report.picks[0]!.summary = "The model chose {{picked.label}}.";
      }),
    );
    const outcome = await run(store, good, { requestId: "fact-reference" });
    expect(outcome.ok).toBe(true);
    if (outcome.ok)
      expect(outcome.board.explanation?.picks[0]?.summary).toBe("The model chose PHI.");
    const bad = scripted(async (packet) =>
      withReport(await fixtureAnswer(packet), (report) => {
        report.picks[0]!.summary = "The model chose {{picked.invalid}}.";
      }),
    );
    const rejected = await run(createMemoryStore(), bad, { requestId: "bad-fact-reference" });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toContain("Unknown moneyline fact reference");
  });

  it("renders numeric evidence references only when the claim cites that evidence", async () => {
    const collect = async () => ({
      items: [
        {
          id: "source:team:qb",
          sourceId: "example",
          url: null,
          retrievedAt: "2026-10-25T15:00:00Z",
          publishedAt: "2026-10-25T15:00:00Z",
          origin: "automatic" as const,
          facts: { passingYards: 287, change: -3.5 },
          excerpt: "Quarterback evidence",
          checksum: null,
          factKey: null,
        },
      ],
      gaps: ["The injury report is older than 24 hours."],
      materialGaps: [],
    });
    const drafter = scripted(async (packet) =>
      withReport(await fixtureAnswer(packet), (report) => {
        const claim = report.picks[0]!.claims[0]!;
        claim.text = "{{evidence:source:team:qb:passingYards}}";
        claim.evidenceIds = ["source:team:qb"];
      }),
    );
    const store = createMemoryStore();
    const outcome = await runGameBoard(board({ requestId: "evidence-number" }), {
      store,
      collect,
      model: model(),
      drafter,
    });
    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    if (!outcome.ok) return;
    const saved = await store.getBoard(outcome.board.id);
    expect(saved?.explanation?.picks[0]?.claims[0]?.text).toBe("passingYards: 287");
    expect(saved?.explanation?.rendererVersion).toBe(1);
    expect(saved?.explanation?.picks[0]?.missingInputs).toContain(
      "The injury report is older than 24 hours.",
    );
    const restored = createMemoryStore();
    await restored.restoreJournal(await store.exportJournal());
    const restoredBoard = await restored.getBoard(outcome.board.id);
    expect(restoredBoard?.explanation).toEqual(saved?.explanation);

    const misused = scripted(async (packet) =>
      withReport(await fixtureAnswer(packet), (report) => {
        report.picks[0]!.summary = "The line is {{evidence:source:team:qb:passingYards}}.";
      }),
    );
    const misusedResult = await runGameBoard(board({ requestId: "misused-number" }), {
      store: createMemoryStore(),
      collect,
      model: model(),
      drafter: misused,
    });
    expect(misusedResult.ok).toBe(false);

    const uncited = scripted(async (packet) =>
      withReport(await fixtureAnswer(packet), (report) => {
        const claim = report.picks[0]!.claims[0]!;
        claim.text = "{{evidence:source:team:qb:passingYards}}";
        claim.evidenceIds = [packet.items.find((item) => item.id !== "source:team:qb")!.id];
      }),
    );
    const rejected = await runGameBoard(board({ requestId: "uncited-number" }), {
      store: createMemoryStore(),
      collect,
      model: model(),
      drafter: uncited,
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toContain("must cite evidence source:team:qb");

    const missing = scripted(async (packet) =>
      withReport(await fixtureAnswer(packet), (report) => {
        report.picks[0]!.claims[0]!.text = "{{evidence:source:team:qb:missing}}";
        report.picks[0]!.claims[0]!.evidenceIds = ["source:team:qb"];
      }),
    );
    const missingResult = await runGameBoard(board({ requestId: "missing-number" }), {
      store: createMemoryStore(),
      collect,
      model: model(),
      drafter: missing,
    });
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok) expect(missingResult.error).toContain("evidence fact reference");
  });
});

describe("pick explanation provider accounting and recovery", () => {
  it("sums the draft and the repair, and leaves unknown cost unknown", async () => {
    const store = createMemoryStore();
    const drafter = scripted(async (packet) => ({
      ...(await fixtureAnswer(packet)),
      repairAttempted: true,
      providerRequests: [
        request("req-1", "draft", { response: "first" }),
        request("req-2", "repair", {
          response: "second",
          costUsd: null,
          costKnown: false,
          totalTokens: null,
        }),
      ],
    }));
    const outcome = await run(store, drafter, { requestId: "usage" });
    expect(outcome.ok, outcome.ok ? "" : outcome.error).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.board.providerRequests.map((item) => item.requestId)).toEqual([
      "req-1",
      "req-2",
    ]);
    expect(outcome.board.usage).toEqual({
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: null,
      costUsd: null,
      partial: true,
    });
  });

  it("totals known usage across the draft and the repair", async () => {
    const store = createMemoryStore();
    const drafter = scripted(async (packet) => ({
      ...(await fixtureAnswer(packet)),
      repairAttempted: true,
      providerRequests: [request("a", "draft"), request("b", "repair")],
    }));
    const outcome = await run(store, drafter, { requestId: "usage-known" });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.board.usage).toEqual({
      promptTokens: 200,
      completionTokens: 100,
      totalTokens: 300,
      costUsd: 0.02,
      partial: false,
    });
  });

  it("keeps first-request accounting when the repair fails in transit", async () => {
    const store = createMemoryStore();
    const drafter = scripted(async (packet) => ({
      ...(await fixtureAnswer(packet)),
      draftingFailed: true,
      repairAttempted: true,
      report: null,
      error: { kind: "transport", status: null, message: "network down" },
      providerRequests: [
        request("a", "draft"),
        request("b", "repair", { outcome: "failed", costUsd: null, costKnown: false }),
      ],
    }));
    const outcome = await run(store, drafter, { requestId: "transit" });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.board!.status).toBe("failed");
    expect(outcome.board!.providerRequests).toHaveLength(2);
    expect(outcome.board!.usage).toMatchObject({ promptTokens: 200, costUsd: null, partial: true });
    expect(outcome.board!.markets[0]!.pick).not.toBeNull();
  });

  it("finalizes from the saved provider response after a write failure, without another request", async () => {
    const store = createMemoryStore();
    let calls = 0;
    const drafter = scripted(async (packet) => {
      calls += 1;
      const drafted = await fixtureAnswer(packet);
      return {
        ...drafted,
        providerRequests: [request("saved", "draft", { response: drafted.report })],
      };
    });
    const finish = store.finishBoard.bind(store);
    let failures = 1;
    store.finishBoard = async (input) => {
      if (failures-- > 0) throw new Error("connection lost");
      return finish(input);
    };
    await expect(run(store, drafter, { requestId: "recover" })).rejects.toThrow("connection lost");
    expect(calls).toBe(1);
    const retried = await run(store, drafter, { requestId: "recover" });
    expect(retried.ok, retried.ok ? "" : retried.error).toBe(true);
    expect(calls).toBe(1);
    if (!retried.ok) return;
    expect(retried.board.status).toBe("completed");
    expect(retried.board.explanation!.picks[0]).toMatchObject({
      market: "moneyline",
      side: "home",
    });
    expect(retried.board.usage).toMatchObject({ totalTokens: 150, costUsd: 0.01 });
  });

  it("does not accept an unversioned new response after a failed finalization", async () => {
    const store = createMemoryStore();
    let calls = 0;
    const drafter = scripted(async (packet) => {
      calls += 1;
      const drafted = await fixtureAnswer(packet);
      const { formatVersion: _version, ...unversioned } = drafted.report!;
      return {
        ...drafted,
        report: unversioned,
        providerRequests: [request("unversioned", "draft", { response: unversioned })],
      };
    });
    const finish = store.finishBoard.bind(store);
    let failures = 1;
    store.finishBoard = async (input) => {
      if (failures-- > 0) throw new Error("connection lost");
      return finish(input);
    };
    await expect(run(store, drafter, { requestId: "unversioned-recovery" })).rejects.toThrow();
    const retried = await run(store, drafter, { requestId: "unversioned-recovery" });
    expect(retried.ok).toBe(false);
    expect(calls).toBe(1);
    if (!retried.ok) expect(retried.error).toMatch(/formatVersion/);
  });

  it("finalizes from a saved response that arrived as raw JSON text", async () => {
    const store = createMemoryStore();
    let calls = 0;
    const drafter = scripted(async (packet) => {
      calls += 1;
      const drafted = await fixtureAnswer(packet);
      return {
        ...drafted,
        providerRequests: [request("text", "draft", { response: JSON.stringify(drafted.report) })],
      };
    });
    const finish = store.finishBoard.bind(store);
    let failures = 1;
    store.finishBoard = async (input) => {
      if (failures-- > 0) throw new Error("connection lost");
      return finish(input);
    };
    await expect(run(store, drafter, { requestId: "text" })).rejects.toThrow();
    const retried = await run(store, drafter, { requestId: "text" });
    expect(retried.ok, retried.ok ? "" : retried.error).toBe(true);
    expect(calls).toBe(1);
  });

  it("names an ambiguous provider outcome and refuses another automatic request", async () => {
    const store = createMemoryStore();
    let calls = 0;
    const drafter = scripted(async (packet) => {
      calls += 1;
      return {
        ...(await fixtureAnswer(packet)),
        draftingFailed: true,
        report: null,
        error: { kind: "timeout", status: null, message: "timed out" },
        providerRequests: [
          request("late", "draft", { outcome: "ambiguous", costUsd: null, costKnown: false }),
        ],
      };
    });
    const first = await run(store, drafter, { requestId: "ambiguous" });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.error).toMatch(/ambiguous/i);
    expect(first.error).toMatch(/new attempt/i);
    expect(first.board!.providerOutcomeAmbiguous).toBe(true);
    expect(first.board!.markets[0]!.pick).not.toBeNull();

    const replay = await run(store, drafter, { requestId: "ambiguous" });
    expect(replay.ok).toBe(false);
    expect(calls).toBe(1);

    const deliberate = await run(store, scripted(fixtureAnswer), { requestId: "ambiguous-new" });
    expect(deliberate.ok).toBe(true);
  });
});
