import { beforeEach, expect, it, vi } from "vite-plus/test";
import { actions } from "./+page.server.ts";

const state = vi.hoisted(() => ({
  record: vi.fn(async () => ({ kind: "recorded", noticeId: "notice" })),
  finalScore: { home: 24, away: 21 } as { home: number; away: number } | null,
}));
const game = {
  id: "2026_07_DAL_PHI",
  home: "PHI",
  away: "DAL",
  kickoff: "2026-10-25T17:00:00.000Z",
};
vi.mock("#lib/server/config.ts", () => ({
  ConfigError: class extends Error {},
  now: () => "2026-10-25T23:00:00.000Z",
  schedulePath: () => "fixture.csv",
  researchStore: () => ({
    getBoard: async () => ({ id: "00000000-0000-4000-8000-000000000001", game }),
    recordGameSettlement: state.record,
  }),
}));
vi.mock("#lib/server/analysis/schedule.ts", () => ({
  readSchedule: () => ({
    ok: true,
    path: "fixture.csv",
    retrievedAt: "2026-10-25T22:00:00.000Z",
    games: [{ ...game, finalScore: state.finalScore }],
  }),
}));
vi.mock("#lib/server/sources/download-record.ts", () => ({
  readDownloadRecord: () => ({
    source: "https://example.test/schedule.csv",
    retrievedAt: "2026-10-25T22:00:00.000Z",
  }),
}));

beforeEach(() => {
  state.record.mockClear();
  state.finalScore = { home: 24, away: 21 };
});

it("requires deliberate confirmation before starting another explanation", async () => {
  const request = new Request(
    "http://localhost/board/00000000-0000-4000-8000-000000000001?/explain",
    { method: "POST", body: new URLSearchParams() },
  );
  expect(
    await actions.explain({
      request,
      params: { id: "00000000-0000-4000-8000-000000000001" },
    } as never),
  ).toMatchObject({
    status: 400,
    data: { explanationError: expect.stringMatching(/deliberate new/) },
  });
  expect(state.record).not.toHaveBeenCalled();
});

async function confirm(fields: Record<string, string>) {
  const request = new Request(
    "http://localhost/board/00000000-0000-4000-8000-000000000001?/confirmResult",
    { method: "POST", body: new URLSearchParams(fields) },
  );
  return actions.confirmResult({
    request,
    params: { id: "00000000-0000-4000-8000-000000000001" },
  } as never);
}

it("rejects a missing confirmation or stale proposal without recording a notice", async () => {
  expect(await confirm({ identity: "stale", confirmed: "yes" })).toMatchObject({ status: 400 });
  expect(await confirm({})).toMatchObject({ status: 400 });
  state.finalScore = null;
  expect(await confirm({ identity: "stale", confirmed: "yes" })).toMatchObject({ status: 400 });
  expect(state.record).not.toHaveBeenCalled();
});

it("records exactly the re-read sourced score only after matching explicit confirmation", async () => {
  const { settlementPrefill } = await import("#lib/server/analysis/settlement-prefill.ts");
  const candidate = settlementPrefill({
    game,
    now: "2026-10-25T23:00:00.000Z",
    source: "https://example.test/schedule.csv",
    schedule: {
      ok: true,
      path: "fixture.csv",
      retrievedAt: "2026-10-25T22:00:00.000Z",
      games: [
        {
          ...game,
          season: 2026,
          week: 7,
          venue: { name: "Philadelphia", stadiumId: "phi", roof: "outdoors" },
          finalScore: state.finalScore,
          scheduleSpread: null,
        },
      ],
    },
  });
  expect(await confirm({ identity: candidate!.identity })).toMatchObject({ status: 400 });
  expect(state.record).not.toHaveBeenCalled();
  expect(
    await confirm({ identity: candidate!.identity, confirmed: "yes", homeScore: "999" }),
  ).toMatchObject({ settled: true });
  expect(state.record).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      gameId: game.id,
      homeScore: 24,
      awayScore: 21,
      kind: "final",
      source: "https://example.test/schedule.csv, retrieved 2026-10-25T22:00:00.000Z",
    }),
  );
});
