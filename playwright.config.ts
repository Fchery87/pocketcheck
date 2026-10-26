import { randomUUID } from "node:crypto";
import { defineConfig } from "@playwright/test";
import { browserFixture } from "./src/lib/server/verification.ts";
import { verificationEnv } from "./scripts/verification-env.ts";

const origin = "http://127.0.0.1:42627";
const journalId = process.env.POCKETCHECK_EXPECTED_JOURNAL_ID ?? `browser-${randomUUID()}`;
process.env.POCKETCHECK_EXPECTED_JOURNAL_ID = journalId;

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  webServer: {
    command: "node --experimental-strip-types scripts/browser-server.ts",
    env: {
      ...verificationEnv(),
      ...browserFixture,
      POCKETCHECK_TEST_JOURNAL_ID: journalId,
      HOST: "127.0.0.1",
      PORT: "42627",
      PROTOCOL_HEADER: "x-forwarded-proto",
    },
    url: `${origin}/__verification`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { baseURL: origin, extraHTTPHeaders: { "x-forwarded-proto": "http" } },
});
