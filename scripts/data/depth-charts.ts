import { resolve } from "node:path";
import { downloadSource, seasonOf } from "../../src/lib/server/sources/downloads.ts";

// Downloads one nflverse depth-chart season and records when it was retrieved. The file stays in
// data/sources. Only rows with a timestamp before the decision cutoff are used, which is 2025 onward.
// Settings runs the same download.

const season = Number(process.argv[2] ?? seasonOf(new Date().toISOString()));
if (!Number.isInteger(season)) {
  console.error(`Season must be a year, not ${process.argv[2]}.`);
  process.exit(1);
}
const output = resolve(process.argv[3] ?? `data/sources/depth_charts_${season}.csv`);

const result = await downloadSource("depth-charts", {
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
