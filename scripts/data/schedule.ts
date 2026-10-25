import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { checksumOf } from "../../src/lib/server/sources/cache.ts";
import { fetchBounded } from "../../src/lib/server/sources/fetch.ts";

// Downloads the public nflverse schedule and records when it was retrieved.
// The app reads data/sources/games.csv and takes its retrieval time from games.csv.json.

const SOURCE = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
const output = resolve(process.argv[2] ?? "data/sources/games.csv");

const result = await fetchBounded(SOURCE, { timeoutMs: 30_000, schema: "nflverse-games", fetch });
if (!result.ok) {
  console.error(
    `Schedule download failed: ${result.failure}. The existing file, if any, is unchanged.`,
  );
  process.exit(1);
}

const retrievedAt = new Date().toISOString();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, result.body);
const record = {
  source: SOURCE,
  retrievedAt,
  checksum: checksumOf(result.body),
  rows: result.body.split(/\r?\n/).filter((line) => line.length > 0).length - 1,
};
writeFileSync(`${output}.json`, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ output, ...record }));
