import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.get("/__verification");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ mode: "fixture-browser" });
});

async function freezeParent(page: Page, book: string) {
  await page.goto("/board");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill(book);
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("moneyline-away").fill("+130");
  await page.getByTestId("total-line").fill("44.5");
  await page.getByTestId("total-over").fill("-105");
  await page.getByTestId("total-under").fill("-115");
  await page.getByTestId("freeze-board").click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}$/);
}

test("refreshing a game board links a child to its unchanged parent", async ({ page }) => {
  await freezeParent(page, "Refresh Parent Book");
  const parentUrl = page.url();
  const parentPath = new URL(parentUrl).pathname;
  const parentTotal = await page.getByTestId("model-pick-total").innerText();

  await page.getByTestId("refresh-board").click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("board-sportsbook")).toHaveValue("Refresh Parent Book");
  await expect(page.getByTestId("moneyline-home")).toHaveValue("-150");
  await expect(page.getByTestId("total-line")).toHaveValue("44.5");
  await expect(page.getByTestId("board-game-fixed")).toBeVisible();

  await page.getByTestId("board-sportsbook").fill("Refresh Child Book");
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:45");
  await page.getByTestId("moneyline-home").fill("-165");
  await page.getByTestId("moneyline-away").fill("+145");
  await page.getByTestId("total-line").fill("");
  await page.getByTestId("total-over").fill("");
  await page.getByTestId("total-under").fill("");
  await page.getByTestId("spread-home-line").fill("-3.5");
  await page.getByTestId("spread-home").fill("-110");
  await page.getByTestId("spread-away").fill("-110");
  await page.getByTestId("freeze-board").click();

  await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}$/);
  expect(page.url()).not.toBe(parentUrl);
  await expect(page.getByTestId("parent-link")).toHaveAttribute("href", parentPath);
  await expect(page.getByTestId("board-sportsbook-display")).toContainText("Refresh Child Book");
  await expect(page.getByTestId("parent-pick-moneyline")).toContainText("Earlier board");
  await expect(page.getByTestId("parent-pick-spread")).toContainText("no spread model pick");
  await expect(page.getByTestId("model-pick-total")).toHaveCount(0);

  await page.getByTestId("parent-link").click();
  await expect(page.getByTestId("board-sportsbook-display")).toContainText("Refresh Parent Book");
  expect(await page.getByTestId("model-pick-total").innerText()).toBe(parentTotal);
  await expect(page.getByTestId("refresh-link")).toHaveCount(1);
});

test("a rejected refresh keeps every typed value and stays a refresh", async ({ page }) => {
  await freezeParent(page, "Rejected Refresh Book");
  await page.getByTestId("refresh-board").click();
  await page.waitForLoadState("networkidle");
  await page.getByTestId("moneyline-home").fill("-50");
  await page.getByTestId("freeze-board").click();
  await expect(page.getByTestId("board-error")).toBeVisible();
  await expect(page.getByTestId("moneyline-home")).toHaveValue("-50");
  await expect(page.getByTestId("moneyline-away")).toHaveValue("+130");
  await expect(page.getByTestId("board-sportsbook")).toHaveValue("Rejected Refresh Book");
  await expect(page.getByTestId("board-game-fixed")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Refresh game board" })).toBeVisible();
});
