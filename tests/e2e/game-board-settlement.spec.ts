import { expect, test } from "@playwright/test";

async function freezeBoard(
  page: import("@playwright/test").Page,
  game: string,
  sportsbook: string,
) {
  await page.goto("/board");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("board-game").selectOption(game);
  await page.getByTestId("board-sportsbook").fill(sportsbook);
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("moneyline-away").fill("+130");
  await page.getByTestId("board-tie-rule").selectOption("push");
  await page.getByTestId("freeze-board").click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("board-status")).toHaveText("completed");
}

test("a final score grades the model pick and a correction regrades it with history", async ({
  page,
}) => {
  await freezeBoard(page, "2026_07_DAL_PHI", "Settlement Book");
  const card = page.getByTestId("model-pick-moneyline");
  await expect(card.getByTestId("picked-side")).toHaveText("DAL moneyline +130");
  await expect(card.getByTestId("pick-result")).toContainText("Not settled");
  await page.waitForLoadState("networkidle");

  // PHI (home) wins, so the DAL (away) pick loses.
  await page.getByTestId("settle-event").fill("pick-final-dal-phi");
  await page.getByTestId("settle-home").fill("24");
  await page.getByTestId("settle-away").fill("21");
  await page.getByTestId("settle-submit").click();
  await expect(page.getByTestId("settlement-recorded")).toHaveText("Settlement recorded");
  await expect(card.getByTestId("pick-result")).toHaveText("Lost");
  const firstId = await card.getByTestId("pick-notice-id").first().textContent();

  // A correction names the earlier notice, gives a reason, and regrades the pick.
  await page.getByTestId("settle-event").fill("pick-final-dal-phi-corrected");
  await page.getByTestId("settle-home").fill("17");
  await page.getByTestId("settle-away").fill("20");
  await page.getByTestId("settle-corrects").fill(firstId!.trim());
  await page.getByTestId("settle-reason").fill("Official score changed");
  await page.getByTestId("settle-submit").click();
  await expect(card.getByTestId("pick-result")).toHaveText("Won");
  const notices = card.getByTestId("pick-notice");
  await expect(notices).toHaveCount(2);
  await expect(notices.first()).toContainText("Lost");
  await expect(notices.last()).toContainText("Won");
  await expect(notices.last()).toContainText("Official score changed");
});

test("a postponed notice leaves the pick unresolved and a reused event is refused", async ({
  page,
}) => {
  await freezeBoard(page, "2026_08_BAL_BUF", "Postponed Book");
  const card = page.getByTestId("model-pick-moneyline");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("settle-event").fill("pick-postponed-bal-buf");
  await page.getByTestId("settle-kind").selectOption("postponed");
  await page.getByTestId("settle-submit").click();
  await expect(page.getByTestId("settlement-recorded")).toBeVisible();
  await expect(card.getByTestId("pick-result")).toHaveText("Unresolved");

  await page.getByTestId("settle-event").fill("pick-postponed-bal-buf");
  await page.getByTestId("settle-kind").selectOption("final");
  await page.getByTestId("settle-home").fill("30");
  await page.getByTestId("settle-away").fill("3");
  await page.getByTestId("settle-submit").click();
  await expect(page.getByTestId("settlement-error")).toContainText("different inputs");
  await expect(card.getByTestId("pick-result")).toHaveText("Unresolved");
});
