import { resolve } from "node:path";
import { downloadSource, seasonOf } from "../../src/lib/server/sources/downloads.ts";

// Downloads the public nflverse schedule and records when it was retrieved.
// The app reads data/sources/games.csv and takes its retrieval time from games.csv.json.
// Settings runs the same download.

const output = resolve(process.argv[2] ?? "data/sources/games.csv");

const result = await downloadSource("schedule", {
  season: seasonOf(new Date().toISOString()),
  output,
  fetch,
  now: () => new Date().toISOString(),
});
if (!result.ok) {
  console.error(result.failure);
  process.exit(1);
}
console.log(JSON.stringify({ output, ...result.record }));
