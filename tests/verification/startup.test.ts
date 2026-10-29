import { expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertBrowserFixture,
  browserFixture,
  browserFixtureModel,
} from "../../src/lib/server/verification.ts";
import { withChecksum, type ModelArtifact } from "../../src/lib/server/models/artifact.ts";

for (const [key, value] of Object.entries({
  POCKETCHECK_TEST_MODE: "live",
  POCKETCHECK_JOURNAL: "neon",
  POCKETCHECK_NOW: "2026-10-26T16:00:00.000Z",
  POCKETCHECK_SCHEDULE_CSV: "data/sources/games.csv",
  POCKETCHECK_INJURY_CSV: "data/sources/injuries_2026.csv",
  POCKETCHECK_WEATHER: "on",
  POCKETCHECK_MODEL_ARTIFACT: "data/artifacts/baseline.json",
  DEEPSEEK_API_KEY: "synthetic-never-valid",
  THECLAWBAY_API_KEY: "synthetic-never-valid",
  DATABASE_URL: "postgres://synthetic@localhost/personal",
  POCKETCHECK_TEST_JOURNAL_ID: "personal",
})) {
  it(`refuses ${key} at browser startup before loading the application`, () => {
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "scripts/browser-server.ts"],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          ...browserFixture,
          POCKETCHECK_TEST_JOURNAL_ID: "browser-negative",
          [key]: value,
        },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`Unsafe browser verification configuration: ${key}`);
    expect(result.stdout).not.toContain("Listening");
  });
}

it("rejects a synthetic local env file before starting a configured-provider journal", () => {
  const directory = mkdtempSync(join(tmpdir(), "pocketcheck-env-"));
  try {
    const path = join(directory, ".env");
    writeFileSync(path, "POCKETCHECK_JOURNAL=neon\nTHECLAWBAY_API_KEY=synthetic-never-valid\n");
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      ...browserFixture,
      POCKETCHECK_TEST_JOURNAL_ID: "browser-contamination",
    };
    delete env.POCKETCHECK_JOURNAL;
    delete env.THECLAWBAY_API_KEY;
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", `--env-file=${path}`, "scripts/browser-server.ts"],
      { env, encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Unsafe browser verification configuration: POCKETCHECK_JOURNAL",
    );
    expect(result.stdout).not.toContain("Listening");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("refuses a model that is off instead of the fixture forecasting model", () => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "scripts/browser-server.ts"],
    {
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        ...browserFixture,
        POCKETCHECK_TEST_JOURNAL_ID: "browser-negative",
        POCKETCHECK_MODEL_ARTIFACT: "off",
      },
    },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    "Unsafe browser verification configuration: POCKETCHECK_MODEL_ARTIFACT",
  );
  expect(result.stdout).not.toContain("Listening");
});

it("pins the checked-in fixture forecasting model", () => {
  expect(browserFixture.POCKETCHECK_MODEL_ARTIFACT).toBe(
    "tests/fixtures/models/browser-forecasting-model.json",
  );
  expect(browserFixtureModel()).toEqual({
    artifact: "tests/fixtures/models/browser-forecasting-model.json",
    checksum: "69aed22c0fdeae492bec96e0a65328341e0f765aac069f7eac1bd36b8003d1ad",
    releaseStatus: "unreleased",
    trainingCutoff: "2024-09-22T17:00:00Z",
  });
});

it("refuses an altered fixture forecasting model", () => {
  const env = { ...browserFixture, POCKETCHECK_TEST_JOURNAL_ID: "browser-negative" };
  const original = readFileSync(browserFixture.POCKETCHECK_MODEL_ARTIFACT, "utf8");
  const { checksum: _checksum, ...body } = JSON.parse(original) as ModelArtifact;
  // A released copy with a valid recomputed checksum is still not the pinned fixture.
  const released = JSON.stringify(
    withChecksum({ ...body, releaseStatus: "released-experimental" }),
  );
  // An edit that leaves the old checksum fails the artifact's own checksum.
  const edited = original.replace('"unreleased"', '"released-experimental"');
  for (const contents of [released, edited, "not json"]) {
    expect(() => assertBrowserFixture(env, () => contents)).toThrow(
      "Unsafe browser verification configuration: POCKETCHECK_MODEL_ARTIFACT",
    );
  }
  expect(() => assertBrowserFixture(env, () => original)).not.toThrow();
});
