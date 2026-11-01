import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { createNeonSettings } from "#lib/server/settings/neon-settings.ts";
import { describeSettingsContract } from "../settings-contract.ts";
import { isolatedDb, type IsolatedDb } from "./isolated-db.ts";

// Each case needs an empty settings table, so each gets its own schema.
const schemas: IsolatedDb[] = [];
let next: IsolatedDb[] = [];
beforeAll(async () => {
  next = await Promise.all([1, 2, 3, 4, 5, 6].map(() => isolatedDb()));
  schemas.push(...next);
}, 120_000);
afterAll(() => Promise.all(schemas.map((schema) => schema.drop())));
describeSettingsContract("Neon", (options) => createNeonSettings(next.shift()!.db, options));

it("shows a test saved before redaction without the configured key", async () => {
  const { db } = next.shift()!;
  const key = "claw_dummy_old_9d2e44";
  await db`
    INSERT INTO model_tests (provider, model_id, ok, reason, tested_at)
    VALUES ('theclawbay', 'grok-4.7', false, ${`failed: ${key}`}, '2026-10-25T20:00:00.000Z')
  `;
  const tests = await createNeonSettings(db, { secrets: [key] }).getModelTests("theclawbay");
  expect(tests["grok-4.7"]?.reason).toBe("failed: [redacted]");
});
