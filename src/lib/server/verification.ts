import { readFileSync } from "node:fs";
import { artifactChecksum } from "./models/artifact.ts";

/** Checked-in deterministic forecasting model. Fitted from tests/model/fixtures/synthetic-games.json. */
const FIXTURE_MODEL = {
  artifact: "tests/fixtures/models/browser-forecasting-model.json",
  checksum: "69aed22c0fdeae492bec96e0a65328341e0f765aac069f7eac1bd36b8003d1ad",
  releaseStatus: "unreleased",
  trainingCutoff: "2024-09-22T17:00:00Z",
} as const;

export const browserFixture = {
  POCKETCHECK_TEST_MODE: "fixture-browser",
  POCKETCHECK_JOURNAL: "memory",
  POCKETCHECK_NOW: "2026-10-25T16:00:00.000Z",
  POCKETCHECK_SCHEDULE_CSV: "tests/fixtures/sources/games-minimized.csv",
  POCKETCHECK_INJURY_CSV: "tests/fixtures/sources/injuries-2026-live-sample.csv",
  POCKETCHECK_WEATHER: "off",
  POCKETCHECK_MODEL_ARTIFACT: FIXTURE_MODEL.artifact,
  DATABASE_URL: "",
  THECLAWBAY_API_KEY: "",
  DEEPSEEK_API_KEY: "",
} as const;

/** The forecasting model identity /__verification reports. */
export function browserFixtureModel(): typeof FIXTURE_MODEL {
  return FIXTURE_MODEL;
}

type ReadText = (path: string) => string;

const readText: ReadText = (path) => readFileSync(path, "utf8");

function unsafe(key: string): Error {
  return new Error(`Unsafe browser verification configuration: ${key}`);
}

/** The artifact file must be the pinned, unreleased fixture with an intact checksum. */
function assertFixtureModel(read: ReadText): void {
  let artifact: Record<string, unknown>;
  try {
    artifact = JSON.parse(read(FIXTURE_MODEL.artifact)) as Record<string, unknown>;
  } catch {
    throw unsafe("POCKETCHECK_MODEL_ARTIFACT");
  }
  const { checksum, ...body } = artifact;
  if (
    checksum !== FIXTURE_MODEL.checksum ||
    artifactChecksum(body as Parameters<typeof artifactChecksum>[0]) !== checksum ||
    artifact.releaseStatus !== FIXTURE_MODEL.releaseStatus ||
    artifact.trainingCutoff !== FIXTURE_MODEL.trainingCutoff
  ) {
    throw unsafe("POCKETCHECK_MODEL_ARTIFACT");
  }
}

export function assertBrowserFixture(
  env: Record<string, string | undefined>,
  read: ReadText = readText,
): void {
  for (const [key, expected] of Object.entries(browserFixture)) {
    if ((env[key] ?? "") !== expected) throw unsafe(key);
  }
  if (!env.POCKETCHECK_TEST_JOURNAL_ID?.startsWith("browser-")) {
    throw unsafe("POCKETCHECK_TEST_JOURNAL_ID");
  }
  assertFixtureModel(read);
}
