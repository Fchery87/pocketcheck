import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  webServer: {
    command: "PORT=42627 npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:42627",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:42627",
  },
});
