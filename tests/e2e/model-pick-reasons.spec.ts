import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.get("/__verification");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ mode: "fixture-browser" });
});

async function fillBoard(page: Page, sportsbook: string) {
  await page.goto("/board");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill(sportsbook);
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("moneyline-away").fill("+130");
}

test("a model pick card lists what moved the forecast and the evidence gaps", async ({ page }) => {
  await fillBoard(page, "Reasons Lane Book");
  await page.getByTestId("freeze-board").click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}$/);

  const card = page.getByTestId("model-pick-moneyline");
  const drivers = card.getByTestId("driver");
  await expect(drivers.first()).toContainText("points");
  expect(await drivers.count()).toBeGreaterThan(0);
  expect(await drivers.count()).toBeLessThanOrEqual(4);
  // Largest first, by absolute point effect.
  const sizes = (await drivers.allTextContents()).map((text) =>
    Math.abs(Number(/([+−])([0-9.]+) points/.exec(text)!.slice(1).join("").replace("−", "-"))),
  );
  expect(sizes).toEqual([...sizes].sort((left, right) => right - left));
  // The fixture schedule has no injury or weather source, so the gaps stay on the card.
  await expect(card.getByTestId("gaps-moneyline")).toContainText("injury coverage for DAL");
  await expect(card.getByTestId("gaps-moneyline")).toContainText("cannot be graded strong");
});

test("manual evidence and a private lean are saved apart from the model pick", async ({ page }) => {
  await fillBoard(page, "Lean Lane Book");
  await page.getByTestId("manual-text").first().fill("Club report: no starters out for PHI.");
  await page.getByTestId("manual-time").first().fill("2026-10-25T09:00");
  await page.getByTestId("manual-team").first().fill("DAL");
  await page.getByTestId("manual-covers").first().selectOption("injury-report");
  await page.getByTestId("lean").fill("Dallas on the road");
  await page.getByTestId("rationale").fill("Their pass rush travels");
  await page.getByTestId("freeze-board").click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}$/);

  await expect(page.getByTestId("board-lean")).toContainText("Dallas on the road");
  await expect(page.getByTestId("board-lean")).toContainText("Their pass rush travels");
  const card = page.getByTestId("model-pick-moneyline");
  await expect(card).not.toContainText("Dallas on the road");
  await expect(card.getByTestId("gaps-moneyline")).toContainText(
    "injury report comes from manual evidence",
  );
  await page.reload();
  await expect(page.getByTestId("board-lean")).toContainText("Dallas on the road");
});

test("evidence for another team stays visible and does not clear the gap", async ({ page }) => {
  await fillBoard(page, "Wrong Team Book");
  await page.getByTestId("manual-text").first().fill("Club report: no starters out for PHI.");
  await page.getByTestId("manual-time").first().fill("2026-10-25T09:00");
  await page.getByTestId("manual-team").first().fill("PHI");
  await page.getByTestId("manual-covers").first().selectOption("injury-report");
  await page.getByTestId("freeze-board").click();
  await expect(page).toHaveURL(/\/board\/[0-9a-f-]{36}$/);
  const gaps = page.getByTestId("model-pick-moneyline").getByTestId("gaps-moneyline");
  await expect(gaps).toContainText("not for DAL, so it does not clear that team's coverage");
  await expect(gaps).toContainText("cannot be graded strong");
});

test("a rejected board keeps the typed evidence and lean", async ({ page }) => {
  await fillBoard(page, "Kept Evidence Book");
  await page.getByTestId("moneyline-away").fill("");
  await page.getByTestId("manual-text").first().fill("Beat reporter: Hurts limited in practice.");
  await page.getByTestId("lean").fill("Fade Philadelphia");
  await page.getByTestId("freeze-board").click();
  await expect(page.getByTestId("board-error")).toBeVisible();
  await expect(page.getByTestId("manual-text").first()).toHaveValue(
    "Beat reporter: Hurts limited in practice.",
  );
  await expect(page.getByTestId("lean")).toHaveValue("Fade Philadelphia");
});
