import { expect, test } from "@playwright/test";

// A game chosen before the client script runs must survive hydration. The script
// is held back so the choice reliably happens first, whatever the machine load.
test("a game chosen before hydration is kept", async ({ page }) => {
  await page.route("**/_app/immutable/**/*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("main")).toHaveAttribute("data-hydrated", "false");
  await page.getByTestId("game-id").selectOption("2026_07_DAL_PHI");

  await expect(page.locator("main")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByTestId("game-id")).toHaveValue("2026_07_DAL_PHI");
  await expect(page.getByTestId("home")).toHaveText("PHI");
  await expect(page.getByTestId("away")).toHaveText("DAL");
});
