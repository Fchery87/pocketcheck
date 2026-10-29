import { expect, test } from "@playwright/test";

test("a withdrawn board keeps its picks but leaves model-pick performance", async ({ page }) => {
  await page.goto("/board");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill("Withdraw Book");
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("moneyline-away").fill("+130");
  await page.getByTestId("board-tie-rule").selectOption("push");
  await page.getByTestId("freeze-board").click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("board-status")).toHaveText("completed");
  await page.waitForLoadState("networkidle");

  await page.getByTestId("withdraw-reason").fill("Smoke test");
  await page.getByTestId("withdraw-submit").click();
  await expect(page.getByTestId("board-withdrawn")).toContainText("Smoke test");
  await expect(page.getByTestId("withdraw-form")).toHaveCount(0);
  await expect(page.getByTestId("model-pick-moneyline")).toBeVisible();

  await page.goto("/board/performance");
  await expect(page.getByTestId("performance-excluded")).toContainText(/[1-9]\d* withdrawn/);
});
