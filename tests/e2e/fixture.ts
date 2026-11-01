import { test as base } from "@playwright/test";
import { browserPorts } from "../../scripts/browser-port.ts";
import { resetFixtureJournal } from "./fixture-journal.ts";

export { expect } from "@playwright/test";
export type { Page } from "@playwright/test";

export const test = base.extend<{ isolatedJournal: void }>({
  isolatedJournal: [
    async ({ request }, use) => {
      await resetFixtureJournal(
        request,
        process.env.POCKETCHECK_EXPECTED_JOURNAL_ID,
        browserPorts(process.env).origin,
      );
      await use();
    },
    { auto: true },
  ],
});
