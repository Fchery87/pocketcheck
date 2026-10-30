import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.get("/__verification");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ mode: "fixture-browser" });
});

test("a future-dated shopped quote cannot enter a board", async ({ page }) => {
  await page.goto("/board");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill("Anchor Book");
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("moneyline-away").fill("+130");
  await page.getByTestId("board-tie-rule").selectOption("push");
  const quote = page.getByTestId("quote-row").first();
  await quote.getByTestId("quote-sportsbook").fill("Better Book");
  await quote.getByTestId("quote-market").selectOption("moneyline");
  await quote.getByTestId("quote-selection").selectOption("away");
  await quote.getByTestId("quote-odds").fill("+140");
  await quote.getByTestId("quote-observed-at").fill("2026-10-25T12:01");
  await page.getByTestId("freeze-board").click();
  await expect(page.getByTestId("board-error")).toContainText("at or before the decision cutoff");
});

test("a board shops the best price and a bet starts from it", async ({ page }) => {
  await page.goto("/board");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill("Anchor Book");
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("moneyline-away").fill("+130");
  await page.getByTestId("board-tie-rule").selectOption("push");
  await page.getByTestId("spread-home-line").fill("-3.5");
  await page.getByTestId("spread-away-line").fill("+3.5");
  await page.getByTestId("spread-home").fill("-110");
  await page.getByTestId("spread-away").fill("-110");

  const first = page.getByTestId("quote-row").first();
  await first.getByTestId("quote-sportsbook").fill("Better Book");
  await first.getByTestId("quote-market").selectOption("moneyline");
  await first.getByTestId("quote-selection").selectOption("away");
  await first.getByTestId("quote-odds").fill("+140");
  await first.getByTestId("quote-observed-at").fill("2026-10-25T11:40");

  await page.getByTestId("add-quote").click();
  const second = page.getByTestId("quote-row").nth(1);
  await second.getByTestId("quote-sportsbook").fill("Other Line Book");
  await second.getByTestId("quote-market").selectOption("spread");
  await second.getByTestId("quote-selection").selectOption("away");
  await second.getByTestId("quote-odds").fill("-105");
  await second.getByTestId("quote-line").fill("-2.5");
  await second.getByTestId("quote-observed-at").fill("2026-10-25T11:45");
  await page.getByTestId("freeze-board").click();

  await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}$/);
  const moneyline = page.getByTestId("model-pick-moneyline").getByTestId("board-quotes");
  await expect(moneyline).toContainText("Better Book");
  await expect(moneyline).toContainText("+140");
  await expect(moneyline).toContainText("best price");
  const spread = page.getByTestId("model-pick-spread").getByTestId("board-quotes");
  await expect(spread).toContainText("Other Line Book");
  await expect(spread).toContainText("different line, not compared");

  const card = page.getByTestId("model-pick-moneyline");
  await expect(card.getByTestId("picked-side")).toContainText("+140");
  await card.getByTestId("record-bet-from-pick").click();
  await expect(page).toHaveURL(/\/journal\?pick=/);
  await expect(page.getByTestId("bet-sportsbook")).toHaveValue("Better Book");
  await expect(page.getByTestId("bet-odds")).toHaveValue("140");
});
