import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { checksumOf } from "../../src/lib/server/sources/cache.ts";
import { fetchBounded } from "../../src/lib/server/sources/fetch.ts";

// Downloads the public nflverse injury file for a season and records when it was retrieved.
// The app reads data/sources/injuries_<season>.csv and takes its retrieval time from the
// .json record beside it. Injury reports change Wednesday through game day, so re-run it
// before analyzing.

const today = new Date();
// The NFL season is named for the year it starts; January and February games belong to it.
const defaultSeason = today.getUTCMonth() < 2 ? today.getUTCFullYear() - 1 : today.getUTCFullYear();
const season = Number(process.argv[2] ?? defaultSeason);
if (!Number.isInteger(season)) {
  console.error(`Season must be a year, not ${process.argv[2]}.`);
  process.exit(1);
}
const source = `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`;
const output = resolve(process.argv[3] ?? `data/sources/injuries_${season}.csv`);

const result = await fetchBounded(source, { timeoutMs: 30_000, schema: "csv", fetch });
const header = result.ok ? (result.body.split(/\r?\n/, 1)[0] ?? "") : "";
const failure = !result.ok
  ? result.failure
  : ["season", "week", "team", "full_name", "report_status"].every((column) =>
        header.split(",").includes(column),
      )
    ? null
    : "schema mismatch: the injury file is missing expected columns";
if (failure) {
  console.error(`Injury download failed: ${failure}. The existing file, if any, is unchanged.`);
  process.exit(1);
}

const body = result.ok ? result.body : "";
const retrievedAt = new Date().toISOString();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, body);
const record = {
  source,
  retrievedAt,
  checksum: checksumOf(body),
  rows: body.split(/\r?\n/).filter((line) => line.length > 0).length - 1,
};
writeFileSync(`${output}.json`, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ output, ...record }));
