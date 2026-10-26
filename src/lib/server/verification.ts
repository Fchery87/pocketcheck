export const browserFixture = {
  POCKETCHECK_TEST_MODE: "fixture-browser",
  POCKETCHECK_JOURNAL: "memory",
  POCKETCHECK_NOW: "2026-10-25T16:00:00.000Z",
  POCKETCHECK_SCHEDULE_CSV: "tests/fixtures/sources/games-minimized.csv",
  POCKETCHECK_INJURY_CSV: "tests/fixtures/sources/injuries-2026-live-sample.csv",
  POCKETCHECK_WEATHER: "off",
  POCKETCHECK_MODEL_ARTIFACT: "off",
  DATABASE_URL: "",
  THECLAWBAY_API_KEY: "",
  DEEPSEEK_API_KEY: "",
} as const;

export function assertBrowserFixture(env: Record<string, string | undefined>): void {
  for (const [key, expected] of Object.entries(browserFixture)) {
    if ((env[key] ?? "") !== expected) {
      throw new Error(`Unsafe browser verification configuration: ${key}`);
    }
  }
  if (!env.POCKETCHECK_TEST_JOURNAL_ID?.startsWith("browser-")) {
    throw new Error("Unsafe browser verification configuration: POCKETCHECK_TEST_JOURNAL_ID");
  }
}
