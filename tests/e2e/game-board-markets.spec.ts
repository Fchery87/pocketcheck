import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.get("/__verification");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ mode: "fixture-browser" });
});

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("a three-market game board freezes a model pick for each market", async ({ page }) => {
  await page.goto("/board");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill("Three Market Book");
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("moneyline-away").fill("+130");
  await page.getByTestId("spread-home-line").fill("-3.5");
  // The away line fills in as the mirror of the home line.
  await expect(page.getByTestId("spread-away-line")).toHaveValue("+3.5");
  await page.getByTestId("spread-home").fill("-110");
  await page.getByTestId("spread-away").fill("-110");
  await page.getByTestId("total-line").fill("44.5");
  await page.getByTestId("total-over").fill("-105");
  await page.getByTestId("total-under").fill("-115");
  await page.getByTestId("freeze-board").click();

  await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}$/);
  for (const market of ["moneyline", "spread", "total"]) {
    const card = page.getByTestId(`model-pick-${market}`);
    await expect(card.getByTestId("release-label")).toHaveText("Unvalidated model pick");
    await expect(card.getByTestId("strength-grade")).toBeVisible();
  }
  const spread = page.getByTestId("model-pick-spread");
  await expect(spread.getByTestId("side-home")).toContainText("-3.5");
  await expect(spread.getByTestId("side-away")).toContainText("+3.5");
  const total = page.getByTestId("model-pick-total");
  await expect(total.getByTestId("side-over")).toContainText("44.5");
  await expect(total.getByTestId("side-under")).toContainText("44.5");
  // Pushes come from the forecasting model's margin and total distributions.
  await expect(spread.getByTestId("model-push").first()).toHaveText(/^\d+\.\d\d%$/);
  await expect(total.getByTestId("model-push").first()).toHaveText(/^\d+\.\d\d%$/);
});

test("a rejected spread keeps every typed value", async ({ page }) => {
  await page.goto("/board");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill("Bad Spread Book");
  await page.getByTestId("spread-home-line").fill("-3.5");
  await page.getByTestId("spread-away-line").fill("+3");
  await page.getByTestId("spread-home").fill("-110");
  await page.getByTestId("spread-away").fill("-110");
  await page.getByTestId("total-line").fill("44.5");
  await page.getByTestId("total-over").fill("-110");
  await page.getByTestId("freeze-board").click();

  await expect(page.getByTestId("board-error")).toContainText("mirror");
  await expect(page.getByTestId("board-sportsbook")).toHaveValue("Bad Spread Book");
  await expect(page.getByTestId("spread-home-line")).toHaveValue("-3.5");
  await expect(page.getByTestId("spread-away-line")).toHaveValue("+3");
  await expect(page.getByTestId("spread-home")).toHaveValue("-110");
  await expect(page.getByTestId("total-line")).toHaveValue("44.5");
  await expect(page.getByTestId("total-over")).toHaveValue("-110");
  await expect(page.getByTestId("total-under")).toHaveValue("");
});

test("a three-market game board fits a 390px phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/board");
  await page.waitForLoadState("networkidle");
  await noHorizontalOverflow(page);
  await page.getByTestId("board-sportsbook").fill("Phone Three Book");
  await page.getByTestId("spread-home-line").fill("-3.5");
  await page.getByTestId("spread-home").fill("-110");
  await page.getByTestId("spread-away").fill("-110");
  await page.getByTestId("total-line").fill("44.5");
  await page.getByTestId("total-over").fill("-110");
  await page.getByTestId("total-under").fill("-110");
  await page.getByTestId("freeze-board").click();
  await expect(page.getByTestId("model-pick-spread")).toBeVisible();
  await expect(page.getByTestId("model-pick-total")).toBeVisible();
  await noHorizontalOverflow(page);
});
