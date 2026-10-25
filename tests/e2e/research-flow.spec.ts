import { expect, test } from "@playwright/test";

test("offer, report, refresh, and unchanged prior report", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("timezone")).toHaveText("America/New_York");
  await expect(page.getByTestId("home")).toHaveText("PHI");
  await expect(page.getByTestId("away")).toHaveText("DAL");
  await expect(page.getByTestId("venue")).toHaveText("Lincoln Financial Field");

  await page.getByTestId("lean").fill("private lean must stay off the packet");
  await page.getByTestId("analyze").click();

  await expect(page.getByTestId("conclusion")).toHaveText("pass");
  await expect(page.getByTestId("citations")).toContainText("schedule:2026_07_DAL_PHI");
  await expect(page.getByTestId("missing-evidence")).toContainText("Injury report");
  await expect(page.getByTestId("progress")).toContainText("checking inputs");
  await expect(page.getByTestId("progress")).toContainText("checking report");
  await expect(page.getByTestId("user-lean")).toContainText("private lean must stay off the packet");
  const firstUrl = page.url();
  const firstSummary = await page.getByTestId("summary").innerText();

  await page.getByTestId("refresh-odds").fill("-105");
  await page.getByTestId("refresh").click();
  await expect(page).not.toHaveURL(firstUrl);
  await expect(page.getByTestId("price")).toContainText("-105");

  await page.goto(firstUrl);
  await expect(page.getByTestId("summary")).toHaveText(firstSummary);
  await expect(page.getByTestId("price")).toContainText("-110");

  await page.goto("/journal");
  await expect(page.getByTestId("assessments")).toContainText("pass");
  await page.locator('input[name="sportsbook"]').fill("Example Book");
  await page.locator('input[name="americanOdds"]').fill("-110");
  await page.locator('input[name="stakeUnits"]').fill("1");
  await page.getByRole("button", { name: "Record bet" }).click();
  await expect(page.getByTestId("bet-recorded")).toBeVisible();
  await expect(page.getByTestId("bets")).toContainText("Example Book");

  await page.goto("/handbook");
  await expect(page.getByTestId("decimal-example")).toHaveText("1.9090909");
  await expect(page.getByTestId("breakeven-example")).toHaveText("52.38095%");
});
