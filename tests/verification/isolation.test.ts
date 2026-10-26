import { expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";

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
