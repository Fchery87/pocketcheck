import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { checksumOf } from "../../src/lib/server/sources/cache.ts";
import { fetchBounded } from "../../src/lib/server/sources/fetch.ts";
import { ROSTER_LICENSE, depthChartFromCsv } from "../../src/lib/server/sources/roster.ts";

// Downloads one nflverse depth-chart season and records when it was retrieved. The file stays in
// data/sources. Only rows with a timestamp before the decision cutoff are used, which is 2025 onward.

const today = new Date();
const defaultSeason = today.getUTCMonth() < 2 ? today.getUTCFullYear() - 1 : today.getUTCFullYear();
const season = Number(process.argv[2] ?? defaultSeason);
if (!Number.isInteger(season)) {
  console.error(`Season must be a year, not ${process.argv[2]}.`);
  process.exit(1);
}
const source = `https://github.com/nflverse/nflverse-data/releases/download/depth_charts/depth_charts_${season}.csv`;
const output = resolve(process.argv[3] ?? `data/sources/depth_charts_${season}.csv`);

const result = await fetchBounded(source, { timeoutMs: 60_000, schema: "csv", fetch });
const failure = !result.ok ? result.failure : (depthChartFromCsv(result.body).gaps[0] ?? null);
if (failure) {
  console.error(
    `Depth chart download failed: ${failure}. The existing file, if any, is unchanged.`,
  );
  process.exit(1);
}

const body = result.ok ? result.body : "";
const retrievedAt = new Date().toISOString();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, body);
const parsed = depthChartFromCsv(body);
const record = {
  source,
  retrievedAt,
  publicationTime: null,
  license: ROSTER_LICENSE,
  checksum: checksumOf(body),
  rows: parsed.rows.length,
  gaps: parsed.gaps,
};
writeFileSync(`${output}.json`, `${JSON.stringify(record, null, 2)}\n`);
console.log(
  JSON.stringify({ output, retrievedAt, rows: record.rows, license: record.license.name }),
);
