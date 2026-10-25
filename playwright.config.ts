import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  webServer: {
    // Fixture schedule, memory journal, fixed clock, and a fixed zone keep the browser run deterministic.
    command:
      "PORT=42627 TZ=America/New_York POCKETCHECK_JOURNAL=memory POCKETCHECK_NOW=2026-10-25T16:00:00.000Z POCKETCHECK_SCHEDULE_CSV=tests/fixtures/sources/games-minimized.csv POCKETCHECK_INJURY_CSV=tests/fixtures/sources/injuries-2026-live-sample.csv POCKETCHECK_WEATHER=off npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:42627",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:42627",
  },
});
