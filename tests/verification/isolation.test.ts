import { expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { verificationRunEnv } from "../../scripts/verification-env.ts";

it("checks standalone scripts and tests without Svelte-generated type roots", () => {
  const config = ts.readConfigFile("tsconfig.tooling.json", ts.sys.readFile);
  expect(config.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
  expect(parsed.errors).toEqual([]);
  for (const path of [
    "scripts/verify.ts",
    "scripts/journal/export.ts",
    "tests/verification/isolation.test.ts",
    "tests/journal-backup-contract.ts",
    "tests/e2e/fixture.ts",
    "playwright.config.ts",
  ]) {
    expect(parsed.fileNames).toContain(path);
  }
  expect(parsed.options.types).toEqual(["node"]);
  expect(config.config.extends).toBeUndefined();
  const appConfig = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  for (const path of config.config.exclude) {
    expect(appConfig.config.include).toContain(path);
  }
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  expect(scripts.check).toContain("npm run check:tooling");
  expect(scripts["check:tooling"]).toBe("tsc --project tsconfig.tooling.json");
});

it("does not pass credentials or caller compiler overrides to tooling checks", () => {
  const env = verificationRunEnv({
    PATH: "/synthetic/bin",
    DATABASE_URL: "postgres://synthetic@localhost/personal",
    DEEPSEEK_API_KEY: "synthetic-never-valid",
    NODE_OPTIONS: "--import=untrusted.mjs",
    TS_NODE_PROJECT: "untrusted.json",
    POCKETCHECK_ACCESS_SECRET: "synthetic-access-secret-never-valid",
    POCKETCHECK_UNSAFE_LAN: "1",
  });
  expect(env.DATABASE_URL).toBe("");
  expect(env.DEEPSEEK_API_KEY).toBe("");
  expect(env.NODE_OPTIONS).toBeUndefined();
  expect(env.TS_NODE_PROJECT).toBeUndefined();
  expect(env.POCKETCHECK_ACCESS_SECRET).toBe("");
  expect(env.POCKETCHECK_UNSAFE_LAN).toBe("");
});

it("blocks a real provider request before transport", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",

      "--input-type=module",
      "-e",
      `globalThis.fetch = async () => { throw new Error('transport reached'); };
     await import('./scripts/reject-outbound.mjs');
     const { createDeepSeekProvider } = await import('./src/lib/server/providers/deepseek.ts');
     await createDeepSeekProvider({apiKey:'synthetic-never-valid'}).discoverModels();`,
    ],
    { encoding: "utf8", env: { PATH: process.env.PATH } },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Fixture verification blocked outbound request");
});

it("requires an explicit disposable database even when a personal database is configured", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      "await import('./tests/integration/isolated-db.ts')",
    ],
    {
      encoding: "utf8",
      env: { PATH: process.env.PATH, DATABASE_URL: "postgres://synthetic@localhost/personal" },
    },
  );
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("TEST_DATABASE_URL is required");
});
