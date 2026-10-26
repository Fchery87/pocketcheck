import { expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserFixture } from "../../src/lib/server/verification.ts";

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
