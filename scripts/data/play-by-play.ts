import { resolve } from "node:path";
import { downloadSource, seasonOf } from "../../src/lib/server/sources/downloads.ts";

// Downloads one nflverse play-by-play season file and records when it was retrieved.
// The file stays in data/sources. The app reads compact summaries from it and never stores
// the season file in the journal. Re-run it after games finish, before the next analysis.

const season = Number(process.argv[2] ?? seasonOf(new Date().toISOString()));
if (!Number.isInteger(season)) {
  console.error(`Season must be a year, not ${process.argv[2]}.`);
  process.exit(1);
}
const output = resolve(process.argv[3] ?? `data/sources/play_by_play_${season}.csv`);

const result = await downloadSource("play-by-play", {
  season,
  output,
  fetch,
  now: () => new Date().toISOString(),
});
if (!result.ok) {
  console.error(result.failure);
  process.exit(1);
}
console.log(JSON.stringify({ output, ...result.record }));
