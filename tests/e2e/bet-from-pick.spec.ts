import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.get("/__verification");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ mode: "fixture-browser" });
});

test("a bet recorded from a model pick keeps the odds that were placed", async ({
  page,
  request,
}) => {
  await page.goto("/board");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill("Pick Lane Book");
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("moneyline-away").fill("+130");
  await page.getByTestId("board-tie-rule").selectOption("push");
  await page.getByTestId("freeze-board").click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}$/);
  const boardUrl = page.url();
  const card = page.getByTestId("model-pick-moneyline");
  await expect(card.getByTestId("picked-side")).toHaveText("DAL moneyline +130");

  await card.getByTestId("record-bet-from-pick").click();
  await expect(page).toHaveURL(/\/journal\?pick=[0-9a-f-]{36}/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("bet-pick-start")).toContainText("DAL at PHI");
  // The picked contract is only a starting point.
  await expect(page.getByTestId("bet-sportsbook")).toHaveValue("Pick Lane Book");
  await expect(page.getByTestId("bet-market")).toHaveValue("moneyline");
  await expect(page.getByTestId("bet-selection")).toHaveValue("away");
  await expect(page.getByTestId("bet-tie")).toHaveValue("push");
  await expect(page.getByTestId("bet-odds")).toHaveValue("130");

  await page.getByTestId("bet-sportsbook").fill("Corner Book");
  await page.getByTestId("bet-odds").fill("+120");
  await page.getByLabel("Stake units").fill("1");
  await page.getByRole("button", { name: "Record bet" }).click();
  await expect(page.getByTestId("bet-recorded")).toBeVisible();

  await page.goto("/journal");
  const bet = page.getByTestId("bets").getByTestId("bet-contract");
  await expect(bet).toContainText("Corner Book moneyline away");
  await expect(bet).toContainText("120 for 1 units");
  await expect(bet).not.toContainText("130");
  await expect(page.getByTestId("bet-from-pick")).toBeVisible();

  await page.getByTestId("settle-bet").selectOption({ index: 1 });
  await page.getByTestId("settle-event").fill("pick-bet-final");
  await page.getByTestId("settle-kind").selectOption("final");
  await page.getByTestId("settle-home").fill("24");
  await page.getByTestId("settle-away").fill("20");
  await page.getByRole("button", { name: "Record settlement" }).click();
  await expect(page.getByTestId("settlement-recorded")).toBeVisible();
  await expect(page.getByTestId("pick-bet-result")).toHaveText("loss");
  await expect(page.getByTestId("bet-counts")).toContainText("1 settled");

  // The board and its model pick are unchanged.
  await page.goto(boardUrl);
  await expect(page.getByTestId("model-pick-moneyline").getByTestId("picked-side")).toHaveText(
    "DAL moneyline +130",
  );
  await expect(page.getByTestId("board-sportsbook-display")).toContainText("Pick Lane Book");
  const state = await (await request.get("/__verification")).json();
  expect(state.analyses).toBe(0);
});
