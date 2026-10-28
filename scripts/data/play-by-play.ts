import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { checksumOf } from "../../src/lib/server/sources/cache.ts";
import { fetchBounded } from "../../src/lib/server/sources/fetch.ts";
import { PLAY_BY_PLAY_LICENSE } from "../../src/lib/server/sources/play-by-play.ts";

// Downloads one nflverse play-by-play season file and records when it was retrieved.
// The file stays in data/sources. The app reads compact summaries from it and never stores
// the season file in the journal. Re-run it after games finish, before the next analysis.

const today = new Date();
const defaultSeason = today.getUTCMonth() < 2 ? today.getUTCFullYear() - 1 : today.getUTCFullYear();
const season = Number(process.argv[2] ?? defaultSeason);
if (!Number.isInteger(season)) {
  console.error(`Season must be a year, not ${process.argv[2]}.`);
  process.exit(1);
}
const source = `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${season}.csv`;
const output = resolve(process.argv[3] ?? `data/sources/play_by_play_${season}.csv`);

const result = await fetchBounded(source, { timeoutMs: 120_000, schema: "csv", fetch });
const header = result.ok ? (result.body.split(/\r?\n/, 1)[0] ?? "") : "";
const columns = header.split(",");
const failure = !result.ok
  ? result.failure
  : ["game_id", "posteam", "defteam", "play_type", "epa"].every((column) => columns.includes(column))
    ? null
    : "schema mismatch: the play-by-play file is missing expected columns";
if (failure) {
  console.error(`Play-by-play download failed: ${failure}. The existing file, if any, is unchanged.`);
  process.exit(1);
}

const body = result.ok ? result.body : "";
const retrievedAt = new Date().toISOString();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, body);
const record = {
  source,
  retrievedAt,
  publicationTime: null,
  license: PLAY_BY_PLAY_LICENSE,
  checksum: checksumOf(body),
  rows: body.split(/\r?\n/).filter((line) => line.length > 0).length - 1,
};
writeFileSync(`${output}.json`, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify({ output, retrievedAt, rows: record.rows, license: record.license.name }));
