import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.get("/__verification");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    mode: "fixture-browser",
    now: "2026-10-25T16:00:00.000Z",
    model: {
      artifact: "tests/fixtures/models/browser-forecasting-model.json",
      releaseStatus: "unreleased",
    },
  });
});

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("a moneyline game board freezes an unvalidated model pick", async ({ page, request }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Game board" }).first().click();
  await expect(page).toHaveURL(/\/board$/);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill("Board Lane Book");
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("moneyline-away").fill("+130");
  await page.getByTestId("board-tie-rule").selectOption("push");
  await page.getByTestId("freeze-board").evaluate((button) => {
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = "cutoffAt";
    field.value = "2026-10-25T14:00:00.000Z";
    button.closest("form")!.append(field);
  });
  const analysesBefore = (await (await request.get("/__verification")).json()).analyses;
  await page.getByTestId("freeze-board").click();

  await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Game board: DAL at PHI" })).toBeVisible();
  await expect(page.getByTestId("board-status")).toHaveText("completed");
  const backup = await (await request.get("/journal/export")).json();
  const boardId = page.url().split("/").at(-1);
  expect(backup.gameBoards.find((board: { id: string }) => board.id === boardId).cutoffAt).toBe(
    "2026-10-25T16:00:00.000Z",
  );
  const card = page.getByTestId("model-pick-moneyline");
  await expect(card.getByTestId("release-label")).toHaveText("Unvalidated model pick");
  await expect(card.getByTestId("release-note")).toContainText("has not beaten the closing market");
  // The fixture forecasting model, fitted on a few synthetic games, gives PHI no win chance
  // here. Without a calibrated uncertainty the pick cannot be strong.
  await expect(card.getByTestId("picked-side")).toHaveText("DAL moneyline +130");
  await expect(card.getByTestId("strength-grade")).toHaveText("lean");
  const home = card.getByTestId("side-home");
  const away = card.getByTestId("side-away");
  await expect(home).toContainText("PHI");
  await expect(home).toContainText("-150");
  await expect(away).toContainText("DAL");
  await expect(away).toContainText("+130");
  // No-vig probabilities come from the prices alone: 60% and 43.48% implied, 3.48% margin.
  await expect(home.getByTestId("no-vig")).toHaveText("57.98%");
  await expect(away.getByTestId("no-vig")).toHaveText("42.02%");
  await expect(card.getByTestId("margin")).toHaveText("3.48%");
  await expect(home.getByTestId("model-win")).toHaveText("0.00%");
  await expect(away.getByTestId("model-win")).toHaveText("100.00%");
  await expect(home.getByTestId("expected-value")).toHaveText("-1.0000");
  await expect(away.getByTestId("expected-value")).toHaveText("+1.3000");
  await expect(card.getByTestId("price-cutoff")).toHaveText(
    "Any price keeps lean: the forecasting model gives this side no chance to lose.",
  );
  // The forecasting model chose the side; its identity is shown on the card.
  await expect(card.getByTestId("forecasting-model")).toContainText("9b48472f20f7");
  await expect(card.getByTestId("calculation-version")).toHaveText("model-pick-2026-10-27.1");

  // The drafter wrote the explanation from the frozen pick, and its identity is separate.
  await expect(card.getByTestId("explanation-summary")).toContainText(
    "The forecasting model chose DAL in the moneyline market",
  );
  await expect(card.getByTestId("explanation-other-side")).toContainText(
    "PHI is the opposing side",
  );
  await expect(card.getByTestId("explanation-claims")).toContainText("opposing");
  await expect(page.getByTestId("drafter")).toContainText("fixture-drafter");
  await expect(page.getByTestId("drafter")).toContainText("no AI call");
  await expect(card.getByTestId("forecasting-model")).not.toContainText("fixture-drafter");
  await expect(page.getByTestId("drafter")).not.toContainText("9b48472f20f7");

  // Frozen in the journal, and not an analysis.
  await page.reload();
  await expect(card.getByTestId("release-label")).toHaveText("Unvalidated model pick");
  await expect(page.getByTestId("board-sportsbook-display")).toContainText("Board Lane Book");
  const analysesAfter = (await (await request.get("/__verification")).json()).analyses;
  expect(analysesAfter).toBe(analysesBefore);
});

test("a rejected game board keeps every typed value", async ({ page }) => {
  await page.goto("/board");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill("One Side Book");
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:40");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("board-tie-rule").selectOption("void");
  const requestId = await page.locator('input[name="requestId"]').inputValue();
  await page.getByTestId("freeze-board").click();

  await expect(page.getByTestId("board-error")).toContainText("both moneyline prices");
  await expect(page.getByTestId("board-game")).toHaveValue("2026_07_DAL_PHI");
  await expect(page.getByTestId("board-sportsbook")).toHaveValue("One Side Book");
  await expect(page.getByTestId("board-observed-at")).toHaveValue("2026-10-25T11:40");
  await expect(page.getByTestId("moneyline-home")).toHaveValue("-150");
  await expect(page.getByTestId("moneyline-away")).toHaveValue("");
  await expect(page.getByTestId("board-tie-rule")).toHaveValue("void");
  await expect(page.locator('input[name="requestId"]')).toHaveValue(requestId);
});

test("the game board and model pick fit a 390px phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/board");
  await page.waitForLoadState("networkidle");
  await noHorizontalOverflow(page);
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill("Phone Board Book");
  await page.getByTestId("moneyline-home").fill("-120");
  await page.getByTestId("moneyline-away").fill("+100");
  await page.getByTestId("freeze-board").click();
  await expect(page.getByTestId("model-pick-moneyline")).toBeVisible();
  await noHorizontalOverflow(page);
});
