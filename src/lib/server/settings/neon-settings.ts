import type { Sql } from "postgres";
import type { ModelCatalog, ModelTest } from "../providers/contracts.ts";
import type { DrafterChoice, SettingsStore } from "./store.ts";

const DRAFTER_KEY = "drafter";

export function createNeonSettings(sql: Sql): SettingsStore {
  return {
    async getDrafter() {
      const rows = await sql<{ value: DrafterChoice }[]>`
        SELECT value FROM settings WHERE key = ${DRAFTER_KEY}
      `;
      return rows[0]?.value ?? { provider: "fixture" };
    },
    async setDrafter(choice) {
      await sql`
        INSERT INTO settings (key, value) VALUES (${DRAFTER_KEY}, ${sql.json(choice)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
    },
    async getCatalog(provider) {
      const rows = await sql<
        { base_url: string; retrieved_at: Date; entries: ModelCatalog["entries"] }[]
      >`SELECT base_url, retrieved_at, entries FROM model_catalogs WHERE provider = ${provider}`;
      const row = rows[0];
      if (!row) return null;
      return {
        provider,
        baseUrl: row.base_url,
        retrievedAt: row.retrieved_at.toISOString(),
        entries: row.entries,
      };
    },
    async saveCatalog(catalog) {
      await sql`
        INSERT INTO model_catalogs (provider, base_url, retrieved_at, entries)
        VALUES (
          ${catalog.provider}, ${catalog.baseUrl}, ${catalog.retrievedAt},
          ${sql.json(catalog.entries as never)}
        )
        ON CONFLICT (provider) DO UPDATE SET
          base_url = EXCLUDED.base_url,
          retrieved_at = EXCLUDED.retrieved_at,
          entries = EXCLUDED.entries
      `;
    },
    async getModelTests(provider) {
      const rows = await sql<
        { model_id: string; ok: boolean; reason: string | null; tested_at: Date }[]
      >`SELECT model_id, ok, reason, tested_at FROM model_tests WHERE provider = ${provider}`;
      return Object.fromEntries(
        rows.map((row): [string, ModelTest] => [
          row.model_id,
          { ok: row.ok, reason: row.reason, testedAt: row.tested_at.toISOString() },
        ]),
      );
    },
    async saveModelTest(provider, modelId, test) {
      await sql`
        INSERT INTO model_tests (provider, model_id, ok, reason, tested_at)
        VALUES (${provider}, ${modelId}, ${test.ok}, ${test.reason}, ${test.testedAt})
        ON CONFLICT (provider, model_id) DO UPDATE SET
          ok = EXCLUDED.ok, reason = EXCLUDED.reason, tested_at = EXCLUDED.tested_at
      `;
    },
  };
}
