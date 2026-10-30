import { resolve } from "node:path";
import { downloadSource, seasonOf } from "../../src/lib/server/sources/downloads.ts";

// Downloads the public nflverse injury file for a season and records when it was retrieved.
// The app reads data/sources/injuries_<season>.csv and takes its retrieval time from the
// .json record beside it. Injury reports change Wednesday through game day, so re-run it
// before analyzing. Settings runs the same download.

const season = Number(process.argv[2] ?? seasonOf(new Date().toISOString()));
if (!Number.isInteger(season)) {
  console.error(`Season must be a year, not ${process.argv[2]}.`);
  process.exit(1);
}
const output = resolve(process.argv[3] ?? `data/sources/injuries_${season}.csv`);

const result = await downloadSource("injuries", {
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
