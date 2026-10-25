import { readFileSync } from "node:fs";
import { injuryEvidenceFromCsv } from "../../src/lib/server/sources/injuries.ts";
import { scheduleGamesFromCsv } from "../../src/lib/server/sources/nflverse.ts";
import { assembleEvidencePacket } from "../../src/lib/server/sources/packet.ts";

const schedulePath = process.argv[2] ?? "tests/fixtures/sources/games-minimized.csv";
const gameId = process.argv[3] ?? "2026_07_DAL_PHI";
const csv = readFileSync(schedulePath, "utf8");
const retrievedAt = new Date().toISOString();
const games = scheduleGamesFromCsv(csv, { retrievedAt });
const game = games.find((entry) => entry.id === gameId);
if (!game) {
  console.error(`No game ${gameId} in ${schedulePath}`);
  process.exitCode = 1;
} else {
  const injuries = injuryEvidenceFromCsv("", {
    season: game.season,
    week: game.week,
    teams: [game.home, game.away],
    retrievedAt,
    sourceUrl: "manual-fallback",
  });
  const packet = assembleEvidencePacket({
    game,
    decisionCutoff: retrievedAt,
    items: injuries.items,
    gaps: [
      ...injuries.gaps,
      "Weather was not fetched. Supply a forecast fixture or manual weather evidence.",
    ],
  });
  console.log(
    JSON.stringify(
      {
        game: packet.game && {
          id: packet.game.id,
          kickoff: packet.game.kickoff,
          home: packet.game.home,
          away: packet.game.away,
          venue: packet.game.venue.name,
          roof: packet.game.venue.roof,
          finalScore: packet.game.finalScore,
          scheduleSpread: packet.game.scheduleSpread,
        },
        items: packet.items.length,
        gaps: packet.gaps,
        conflicts: packet.conflicts,
      },
      null,
      2,
    ),
  );
}
