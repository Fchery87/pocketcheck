import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assertUnreleased, fitArtifact, readGames } from "../../src/lib/server/models/train.ts";

// Fits the named games into a new unreleased artifact and writes it beside the artifact in use.
// The games file is always named, so synthetic data is fitted only when its path is given. It
// never replaces the artifact in use unless --replace is given with that artifact's path. Invalid
// inputs leave every existing file untouched and exit non-zero.

const USAGE =
  "Usage: model:refit <games> [in-use] [output], or model:refit <games> <in-use> --replace";
const replace = process.argv.includes("--replace");
const args = process.argv.slice(2).filter((arg) => arg !== "--replace");

function refuse(message: string): never {
  console.error(`${message}\n${USAGE}`);
  process.exit(1);
}

if (!args[0]) refuse("Name the games file to fit.");
if (replace && !args[1]) refuse("Name the artifact in use to replace it.");
if (replace && args[2]) refuse("A replacement writes to the artifact in use, so omit the output.");
const gamesPath = resolve(args[0]);
const inUse = resolve(args[1] ?? "data/artifacts/baseline.json");
const output = replace ? inUse : resolve(args[2] ?? "data/artifacts/baseline-next.json");

try {
  if (!existsSync(gamesPath)) throw new Error(`Games not found: ${gamesPath}`);
  const games = readGames(gamesPath);
  const artifact = fitArtifact(games);
  assertUnreleased(artifact);
  if (existsSync(inUse)) {
    const current = JSON.parse(readFileSync(inUse, "utf8")) as { checksum?: unknown };
    if (artifact.checksum === current.checksum && !replace) {
      console.log(JSON.stringify({ unchanged: true, checksum: artifact.checksum }));
      process.exit(0);
    }
  }
  mkdirSync(dirname(output), { recursive: true });
  const body = `${JSON.stringify(artifact, null, 2)}\n`;
  if (replace && existsSync(inUse)) copyFileSync(inUse, `${inUse}.replaced`);
  writeFileSync(output, body);
  console.log(
    JSON.stringify({
      output,
      checksum: artifact.checksum,
      releaseStatus: artifact.releaseStatus,
      replaced: replace,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
