import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { createNeonStore } from "#lib/server/analysis/neon-store.ts";
import { isolatedDb, type IsolatedDb } from "./isolated-db.ts";

let isolated: IsolatedDb;
const gameId = randomUUID();
const offerId = randomUUID();
const analysisId = randomUUID();

beforeAll(async () => {
  isolated = await isolatedDb({ throughMigration: "006_probability_model.sql" });
  await isolated.db`
    INSERT INTO games (id, source_game_id, season, week, away_team, home_team, kickoff_at, venue, status)
    VALUES (${gameId}, 'legacy-game', 2026, NULL, 'DAL', 'PHI', '2026-10-28T16:00:00Z', NULL, 'scheduled')
  `;
  await isolated.db`
    INSERT INTO offers (
      id, game_id, sportsbook, market, selection, point_line, american_odds, decimal_odds,
      observed_at, entered_at, kickoff_at, rules, opposing, completed_at
    ) VALUES (
      ${offerId}, ${gameId}, 'Legacy Book', 'moneyline', 'home', NULL, -110, 1.9091,
      '2026-10-28T15:00:00Z', '2026-10-28T15:05:00Z', '2026-10-28T16:00:00Z',
      '{"period":"full-game","overtime":"included","tie":"push"}'::jsonb, NULL,
      '2026-10-28T15:10:00Z'
    )
  `;
  await isolated.db`
    INSERT INTO analyses (id, offer_id, cutoff_at, status, conclusion, completed_at)
    VALUES (
      ${analysisId}, ${offerId}, '2026-10-28T15:05:00Z', 'completed', 'pass',
      '2026-10-28T15:10:00Z'
    )
  `;
  await isolated.db.unsafe(
    await readFile(path.resolve("migrations/007_analysis_snapshots.sql"), "utf8"),
  );
}, 60_000);

afterAll(() => isolated?.drop());

describe("legacy analysis snapshots", () => {
  it("freezes available migration-time details and preserves unknown values as unknown", async () => {
    const store = createNeonStore(isolated.db);
    const run = await store.getRun(analysisId);
    expect(run).toMatchObject({
      snapshotVersion: 1,
      snapshotProvenance: "legacy-unknown",
      game: {
        id: "legacy-game",
        week: null,
        venue: null,
        kickoff: new Date("2026-10-28T16:00:00Z").toISOString(),
      },
      offer: {
        gameId: "legacy-game",
        sportsbook: "Legacy Book",
        americanOdds: -110,
        observedAt: new Date("2026-10-28T15:00:00Z").toISOString(),
      },
    });
    expect(
      (await store.listCompleted()).find((summary) => summary.id === analysisId)
        ?.snapshotProvenance,
    ).toBe("legacy-unknown");
  });
});
