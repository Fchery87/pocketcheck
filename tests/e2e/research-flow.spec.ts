import { expect, test } from "@playwright/test";

// playwright.config.ts pins the fixture schedule, a memory journal, the clock
// (2026-10-25T16:00Z), and TZ=America/New_York for the dev server.

test("offer, report, refresh, and unchanged prior report", async ({ page }) => {
  await page.goto("/");
  // The game card follows the select only after hydration.
  await page.waitForLoadState("networkidle");
  await page.getByTestId("game-id").selectOption("2026_07_DAL_PHI");
  await expect(page.getByTestId("timezone")).toHaveText("America/New_York");
  await expect(page.getByTestId("home")).toHaveText("PHI");
  await expect(page.getByTestId("away")).toHaveText("DAL");
  await expect(page.getByTestId("venue")).toHaveText("Lincoln Financial Field");

  await page.getByLabel("Sportsbook").fill("Example Book");
  // A lean that names a team must not break the run.
  await page.getByTestId("lean").fill("PHI");
  await page.getByTestId("rationale").fill("private rationale sentinel");
  await page.getByTestId("observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("analyze").click();

  // One conclusion, owned by the policy.
  await expect(page.getByTestId("conclusion")).toHaveText("insufficient evidence");
  await expect(page.getByTestId("policy")).toContainText("Material evidence is missing.");
  await expect(page.getByTestId("policy")).toContainText("Expected value unavailable");

  // Price mathematics for the recorded offer.
  await expect(page.getByTestId("price")).toContainText("-110");
  await expect(page.getByTestId("decimal-odds")).toHaveText("1.9091");
  await expect(page.getByTestId("break-even")).toHaveText("52.38%");
  await expect(page.getByTestId("observed-at-display")).toContainText("11:30");

  // Claims with stance and the cited evidence itself, with its source and times.
  await expect(page.getByTestId("claims")).toContainText("supporting");
  await expect(page.getByTestId("claims")).toContainText(
    "The schedule evidence identifies the matchup",
  );
  await expect(page.getByTestId("citations")).toContainText("schedule:2026_07_DAL_PHI");
  await expect(page.getByTestId("citations")).toContainText("DAL at PHI, Lincoln Financial Field");
  await expect(page.getByTestId("citations")).toContainText("nflverse-schedule");
  await expect(page.getByTestId("citations")).toContainText("published unknown");
  await expect(page.getByTestId("missing-evidence")).toContainText("Injury report");
  await expect(page.getByTestId("assumptions")).toContainText("Full-game rules");
  await expect(page.getByTestId("uncertainty")).toContainText("No injury or weather evidence");
  await expect(page.getByTestId("change-conditions")).toContainText("different American price");
  await expect(page.getByTestId("drafter")).toContainText("fixture-drafter");

  await expect(page.getByTestId("progress")).toContainText("checking inputs");
  await expect(page.getByTestId("progress")).toContainText("checking report");
  await expect(page.getByTestId("user-lean")).toContainText("PHI");
  await expect(page.getByTestId("user-lean")).toContainText("private rationale sentinel");
  const firstUrl = page.url();
  const firstSummary = await page.getByTestId("summary").innerText();

  // A refresh records when the new price was observed.
  await page.getByTestId("refresh-odds").fill("-105");
  await page.getByTestId("refresh-observed-at").fill("2026-10-25T11:50");
  await page.getByTestId("refresh").click();
  await expect(page).not.toHaveURL(firstUrl);
  await expect(page.getByTestId("price")).toContainText("-105");
  await expect(page.getByTestId("observed-at-display")).toContainText("11:50");

  await page.goto(firstUrl);
  await expect(page.getByTestId("summary")).toHaveText(firstSummary);
  await expect(page.getByTestId("price")).toContainText("-110");
  await expect(page.getByTestId("observed-at-display")).toContainText("11:30");

  await page.goto("/journal");
  await expect(page.getByTestId("assessments").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("assessments")).toContainText("insufficient evidence");
  await page.getByTestId("bet-analysis").selectOption({ index: 1 });
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

test("a started game cannot be selected", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("game-id").locator("option[value='2026_01_OLD_GAME']")).toHaveCount(
    0,
  );
});
