import { expect, test } from "@playwright/test";

test.beforeAll(async ({ request }) => {
  const response = await request.get("/__verification");
  expect(response.ok()).toBe(true);
});

test.beforeEach(async ({ request }) => {
  const response = await request.get("/__verification");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({
    mode: "fixture-browser",
    now: "2026-10-25T16:00:00.000Z",
    journal: { kind: "memory", identity: process.env.POCKETCHECK_EXPECTED_JOURNAL_ID },
    schedule: "tests/fixtures/sources/games-minimized.csv",
    injuries: "tests/fixtures/sources/injuries-2026-live-sample.csv",
    weather: "off",
    model: "off",
    drafter: "fixture",
  });
});

test("production rejects a mismatched form origin", async ({ request }) => {
  const response = await request.post("/settings?/choose", {
    headers: { origin: "https://unexpected.example" },
    form: { drafter: "fixture" },
  });
  expect(response.status()).toBe(403);
});

test("offer, report, refresh, and unchanged prior report", async ({ page, request }) => {
  await page.goto("/");
  // The game card follows the select only after hydration.
  await page.waitForLoadState("networkidle");
  await page.getByTestId("game-id").selectOption("2026_07_DAL_PHI");
  await expect(page.getByTestId("timezone")).toHaveText("America/New_York");
  await expect(page.getByTestId("home")).toHaveText("PHI");
  await expect(page.getByTestId("away")).toHaveText("DAL");
  await expect(page.getByTestId("venue")).toHaveText("Lincoln Financial Field");

  await page.getByLabel("Sportsbook").fill("Example Book");
  await page.getByTestId("market").selectOption("spread");
  await expect(page.getByTestId("selection").locator("option")).toHaveText(["home", "away"]);
  await expect(page.getByTestId("line-guidance")).toContainText("side you selected");
  await expect(page.getByTestId("tie-rule")).toHaveCount(0);
  await page.getByTestId("market").selectOption("total");
  await expect(page.getByTestId("selection").locator("option")).toHaveText(["over", "under"]);
  await expect(page.getByTestId("line-guidance")).toContainText("44.5");
  await page.getByTestId("market").selectOption("moneyline");
  await expect(page.getByTestId("selection").locator("option")).toHaveText(["home", "away"]);
  await expect(page.getByTestId("point-line")).toHaveCount(0);
  await expect(page.getByTestId("tie-guidance")).toContainText("tie rule");
  // A lean that names a team must not break the run.
  await page.getByTestId("lean").fill("PHI");
  await page.getByTestId("rationale").fill("private rationale sentinel");
  await page.getByTestId("observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("manual-text").fill("Beat reporter: Barkley practiced fully Friday.");
  await page.getByTestId("manual-url").fill("https://example.test/barkley-friday");
  await page.getByRole("button", { name: "Add another" }).click();
  const forecast = page.getByTestId("manual-evidence").locator("div").nth(1);
  await forecast.getByTestId("manual-text").fill("Kickoff 52F, wind 8 mph");
  await forecast.getByTestId("manual-time").fill("2026-10-25T11:30");
  await forecast.getByTestId("manual-covers").selectOption("weather");
  const firstRequestId = await page.locator('input[name="requestId"]').inputValue();
  expect(firstRequestId).toMatch(/^[0-9a-f-]{36}$/i);
  await page.getByTestId("american-odds").fill("not a price");
  await page.getByTestId("analyze").click();
  await expect(page.getByTestId("form-error")).toContainText("Invalid American price");
  await expect(page.getByTestId("american-odds")).toHaveValue("not a price");
  await expect(page.locator('input[name="requestId"]')).toHaveValue(firstRequestId);
  await expect(page.getByTestId("lean")).toHaveValue("PHI");
  await page.getByTestId("american-odds").fill("-110");
  const beforeSubmission = await request.get("/__verification");
  expect((await beforeSubmission.json()).analyses).toBe(0);
  await page.getByTestId("analyze").click();

  // One conclusion, owned by the policy.
  await expect(page.getByTestId("conclusion")).toHaveText("insufficient evidence");
  await expect(page.getByTestId("manual-coverage")).toContainText("kickoff forecast");
  await expect(page.getByTestId("snapshot-provenance")).toHaveText(
    "Game and research offer captured with this report.",
  );
  await expect(page.getByTestId("policy")).toContainText("The model is off");
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
  // Gaps come from evidence collection, not from the drafter.
  await expect(page.getByTestId("evidence-gaps")).toContainText("Weather collection is off");
  await expect(page.getByTestId("evidence-gaps")).toContainText("no publication time");
  await expect(page.getByTestId("probability-model")).toContainText(
    "The model is off (POCKETCHECK_MODEL_ARTIFACT=off).",
  );
  // Injury rows from the cached file and the user's own evidence are both in the run.
  await expect(page.getByTestId("all-evidence")).toContainText("Saquon Barkley");
  await expect(page.getByTestId("all-evidence")).toContainText(
    "Beat reporter: Barkley practiced fully Friday.",
  );
  await expect(page.getByTestId("assumptions")).toContainText("Full-game rules");
  await expect(page.getByTestId("uncertainty")).toContainText("Evidence is incomplete");
  await expect(page.getByTestId("change-conditions")).toContainText("different American price");
  await expect(page.getByTestId("drafter")).toContainText("fixture-drafter");

  await expect(page.getByTestId("progress")).toContainText("checking inputs");
  await expect(page.getByTestId("progress")).toContainText("checking report");
  await expect(page.getByTestId("user-lean")).toContainText("PHI");
  await expect(page.getByTestId("user-lean")).toContainText("private rationale sentinel");
  const firstUrl = page.url();
  const firstSummary = await page.getByTestId("summary").innerText();
  const refreshRequestId = await page.locator('input[name="requestId"]').inputValue();
  expect(refreshRequestId).not.toBe(firstRequestId);

  // A refresh records when the new price was observed.
  await page.getByTestId("refresh-odds").fill("not a price");
  await page.getByTestId("refresh-observed-at").fill("2026-10-25T11:50");
  await page.getByTestId("refresh").click();
  await expect(page.getByTestId("form-error")).toContainText("valid American price");
  await expect(page.getByTestId("refresh-odds")).toHaveValue("not a price");
  await expect(page.locator('input[name="requestId"]')).toHaveValue(refreshRequestId);
  await page.getByTestId("refresh-odds").fill("-105");
  await page.getByTestId("refresh-observed-at").fill("2026-10-25T11:50");
  let releaseRefresh: (() => void) | undefined;
  let refreshRequests = 0;
  await page.route("**/*", async (route) => {
    if (!new URL(route.request().url()).search.includes("/refresh")) return route.continue();
    refreshRequests += 1;
    await new Promise<void>((resolve) => (releaseRefresh = resolve));
    await route.continue();
  });
  const submissionGuard = await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-testid="refresh"]');
    button?.click();
    const guard = {
      disabled: button?.disabled,
      submitting: button?.form?.dataset.submitting,
      pending: !document
        .querySelector('[data-testid="submission-pending"]')
        ?.hasAttribute("hidden"),
    };
    button?.click();
    return guard;
  });
  expect(submissionGuard).toEqual({ disabled: true, submitting: "true", pending: true });
  await expect.poll(() => Boolean(releaseRefresh)).toBe(true);
  expect(refreshRequests).toBe(1);
  releaseRefresh?.();
  await expect(page).not.toHaveURL(firstUrl);
  await page.unroute("**/*");
  await expect(page.getByTestId("price")).toContainText("-105");
  await expect(page.getByTestId("observed-at-display")).toContainText("11:50");
  await expect(page.getByTestId("offer-contract")).toContainText("moneyline");
  await expect(page.getByTestId("offer-contract")).toContainText("home");
  await expect(page.getByTestId("parent-link")).toHaveAttribute("href", new URL(firstUrl).pathname);
  await expect(page.getByTestId("all-evidence")).toContainText(
    "Beat reporter: Barkley practiced fully Friday.",
  );

  await page.goto(firstUrl);
  await expect(page.getByTestId("summary")).toHaveText(firstSummary);
  await expect(page.getByRole("heading", { name: "Report: DAL at PHI" })).toBeVisible();
  await expect(page.locator("main > p").first()).toContainText("Lincoln Financial Field");
  await expect(page.getByTestId("price")).toContainText("-110");
  await expect(page.getByTestId("observed-at-display")).toContainText("11:30");
  await expect(page.getByTestId("offer-contract")).toContainText("Example Book");
  await expect(page.getByTestId("offer-contract")).not.toContainText("-105");

  await page.goto("/journal");
  await expect(page.getByTestId("assessments").locator("li")).toHaveCount(2);
  await expect(page.getByTestId("assessments")).toContainText("insufficient evidence");
  await page.getByTestId("bet-analysis").selectOption({ index: 1 });
  await page.getByTestId("bet-submission").fill("browser-placement-1");
  await page.getByTestId("bet-form").locator('input[name="sportsbook"]').fill("Example Book");
  await page.getByTestId("bet-tie").selectOption("push");
  await page.getByTestId("bet-form").locator('input[name="americanOdds"]').fill("-110");
  await page.getByTestId("bet-form").locator('input[name="stakeUnits"]').fill("1");
  await page.getByRole("button", { name: "Record bet" }).click();
  await expect(page.getByTestId("bet-recorded")).toBeVisible();
  await expect(page.getByTestId("bets")).toContainText("Example Book");

  await page.goto("/handbook");
  await expect(page.getByTestId("decimal-example")).toHaveText("1.9090909");
  await expect(page.getByTestId("breakeven-example")).toHaveText("52.38095%");
});

test("a spread refresh changes the line and leaves the parent contract", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("game-id").selectOption("2026_07_DAL_PHI");
  await page.getByLabel("Sportsbook").fill("Example Book");
  await page.getByTestId("market").selectOption("spread");
  await page.getByTestId("selection").selectOption("home");
  await page.getByTestId("point-line").fill("-3.5");
  await page.getByTestId("american-odds").fill("-110");
  await page.getByTestId("observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("analyze").click();
  await expect(page.getByTestId("offer-contract")).toContainText("spread");
  await expect(page.getByTestId("offer-contract")).toContainText("home");
  await expect(page.getByTestId("offer-contract")).toContainText("-3.5");
  const parentUrl = page.url();

  await page.getByTestId("refresh-book").fill("Moved Book");
  await page.getByTestId("refresh-line").fill("-2.5");
  await page.getByTestId("refresh-odds").fill("-105");
  await page.getByTestId("refresh-observed-at").fill("2026-10-25T11:50");
  await page.getByTestId("refresh").click();
  await expect(page).not.toHaveURL(parentUrl);
  await expect(page.getByTestId("offer-contract")).toContainText("Moved Book");
  await expect(page.getByTestId("offer-contract")).toContainText("spread, home");
  await expect(page.getByTestId("offer-contract")).toContainText("-2.5");
  await expect(page.getByTestId("price")).toContainText("-105");
  await expect(page.getByTestId("parent-link")).toHaveAttribute("href", new URL(parentUrl).pathname);

  await page.getByTestId("parent-link").click();
  await expect(page).toHaveURL(parentUrl);
  await expect(page.getByTestId("offer-contract")).toContainText("Example Book");
  await expect(page.getByTestId("offer-contract")).toContainText("-3.5");
  await expect(page.getByTestId("offer-contract")).not.toContainText("-2.5");
  await expect(page.getByTestId("price")).toContainText("-110");
});

test("a researched spread of -3 keeps its terms when the placed bet is -3.5", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("game-id").selectOption("2026_07_DAL_PHI");
  await page.getByLabel("Sportsbook").fill("Research Book");
  await page.locator('select[name="market"]').selectOption("spread");
  await page.locator('select[name="selection"]').selectOption("home");
  await page.locator('input[name="pointLine"]').fill("-3");
  await page.getByTestId("american-odds").fill("-110");
  await page.getByTestId("observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("manual-text").fill("Beat reporter: Barkley practiced fully Friday.");
  await page.getByTestId("manual-url").fill("https://example.test/barkley-friday");
  await page.getByRole("button", { name: "Add another" }).click();
  const forecast = page.getByTestId("manual-evidence").locator("div").nth(1);
  await forecast.getByTestId("manual-text").fill("Kickoff 52F, wind 8 mph");
  await forecast.getByTestId("manual-time").fill("2026-10-25T11:30");
  await forecast.getByTestId("manual-covers").selectOption("weather");
  await page.getByTestId("analyze").click();
  await expect(page.getByTestId("conclusion")).toHaveText("insufficient evidence");
  await expect(page.getByTestId("price")).toContainText("-110");

  await page.goto("/journal");
  await expect(page.getByTestId("assessments")).toContainText("-3");
  await expect(page.getByTestId("assessments")).toContainText("-110");
  await page.getByTestId("bet-analysis").selectOption({ index: 1 });
  await page.getByTestId("bet-submission").fill("spread-execution-1");
  await page.getByTestId("bet-form").locator('input[name="sportsbook"]').fill("Execution Book");
  await page.getByTestId("bet-market").selectOption("spread");
  await page.getByTestId("bet-selection").selectOption("home");
  await page.getByTestId("bet-line").fill("-3.5");
  await page.getByTestId("bet-form").locator('input[name="americanOdds"]').fill("-105");
  await page.getByTestId("bet-form").locator('input[name="stakeUnits"]').fill("2");
  await page.getByRole("button", { name: "Record bet" }).click();
  await expect(page.getByTestId("bet-recorded")).toBeVisible();
  const placed = page.getByTestId("bet-contract");
  await expect(placed).toContainText("Execution Book");
  await expect(placed).toContainText("spread");
  await expect(placed).toContainText("home");
  await expect(placed).toContainText("-3.5");
  await expect(placed).toContainText("-105");
  await expect(placed).toContainText("2");
  await expect(page.getByTestId("assessments")).toContainText("Research Book");
  await expect(page.getByTestId("assessments")).toContainText("-110");
  await expect(page.getByTestId("assessments")).not.toContainText("-3.5");
  await page.reload();
  await expect(page.getByTestId("bet-contract")).toContainText("-3.5");
  await expect(page.getByTestId("bet-contract")).toContainText("-105");
  await expect(page.getByTestId("assessments")).toContainText("-3");
  await expect(page.getByTestId("assessments")).not.toContainText("-3.5");

  await page.getByTestId("settle-analysis").selectOption({ index: 1 });
  await page.getByTestId("settle-bet").selectOption({ index: 1 });
  await page.getByTestId("settle-event").fill("browser-final-dal-phi");
  await page.getByTestId("settle-home").fill("20");
  await page.getByTestId("settle-away").fill("17");
  await page.getByRole("button", { name: "Record settlement" }).click();
  await expect(page.getByTestId("settlement-recorded")).toHaveText("Settlement recorded");
  await expect(page.getByTestId("assessment-result")).toContainText("push");
  await expect(page.getByTestId("bet-result")).toContainText("loss");
  await page.reload();
  await expect(page.getByTestId("assessment-result")).toContainText("push");
  await expect(page.getByTestId("bet-result")).toContainText("loss");
  await expect(page.getByTestId("settlement-notice").last()).toContainText("push");
  await expect(page.getByTestId("bet-result").last()).toContainText("loss");
  const assessments = page.getByTestId("assessment-summary");
  const bets = page.getByTestId("bet-summary");
  await expect(assessments.getByTestId("assessment-counts")).toContainText("push");
  await expect(assessments.getByTestId("assessment-counts")).not.toContainText("0 push");
  await expect(bets.getByTestId("bet-counts")).toContainText("settled");
  await expect(bets.getByTestId("bet-counts")).not.toContainText("0 settled");
  await expect(bets.getByTestId("bet-roi")).not.toContainText("Return unavailable");
  await expect(assessments.getByTestId("assessment-roi")).not.toContainText("Return -1");
});

test("a comparable close, a moved line, and a missing close stay distinct", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("game-id").selectOption("2026_07_DAL_PHI");
  await page.getByLabel("Sportsbook").fill("Research Book");
  await page.locator('select[name="market"]').selectOption("spread");
  await page.locator('select[name="selection"]').selectOption("home");
  await page.locator('input[name="pointLine"]').fill("-3.5");
  await page.getByTestId("american-odds").fill("-110");
  await page.getByTestId("observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("manual-text").fill("Beat reporter: Barkley practiced fully Friday.");
  await page.getByTestId("manual-url").fill("https://example.test/barkley-friday");
  await page.getByRole("button", { name: "Add another" }).click();
  const forecast = page.getByTestId("manual-evidence").locator("div").nth(1);
  await forecast.getByTestId("manual-text").fill("Kickoff 52F, wind 8 mph");
  await forecast.getByTestId("manual-time").fill("2026-10-25T11:30");
  await forecast.getByTestId("manual-covers").selectOption("weather");
  await page.getByTestId("analyze").click();
  await expect(page.getByTestId("conclusion")).toBeVisible();

  await page.goto("/journal");
  await expect(page.getByTestId("closing-missing")).toContainText("unavailable, not zero");
  await expect(page.getByTestId("closing-measure")).toContainText("same market, side, point line");
  await page.getByTestId("closing-subject").selectOption({ index: 1 });
  await page.getByTestId("closing-book").fill("Research Book");
  await page.getByTestId("closing-market").selectOption("spread");
  await page.getByTestId("closing-selection").selectOption("home");
  await page.getByTestId("closing-line").fill("-3.5");
  await page.getByTestId("closing-odds").fill("-120");
  await page.getByTestId("closing-time").fill("2026-10-26T19:50");
  await page.getByTestId("closing-source").fill("manual close");
  await page.getByRole("button", { name: "Record closing observation" }).click();
  await expect(page.getByTestId("closing-recorded")).toBeVisible();
  await expect(page.getByTestId("closing-comparison")).toContainText("1.909");
  await expect(page.getByTestId("closing-comparison")).toContainText("1.833");
  await page.reload();
  await expect(page.getByTestId("closing-comparison")).toContainText("1.833");

  await page.getByTestId("closing-subject").selectOption({ index: 1 });
  await page.getByTestId("closing-book").fill("Research Book");
  await page.getByTestId("closing-market").selectOption("spread");
  await page.getByTestId("closing-selection").selectOption("home");
  await page.getByTestId("closing-line").fill("-3");
  await page.getByTestId("closing-odds").fill("-110");
  await page.getByTestId("closing-time").fill("2026-10-26T19:55");
  await page.getByTestId("closing-source").fill("later board");
  await page.getByRole("button", { name: "Record closing observation" }).click();
  const rows = page.getByTestId("closing-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1).getByTestId("closing-unavailable")).toContainText("different-contract");
  await expect(rows.nth(1).getByTestId("closing-unavailable")).toContainText("not an odds change");
  await expect(rows.nth(0).getByTestId("closing-comparison")).toBeVisible();
});

test("a started game cannot be selected", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("game-id").locator("option[value='2026_01_OLD_GAME']")).toHaveCount(
    0,
  );
});

test("settings starts on the fixture drafter without calling a provider", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByTestId("current-drafter")).toHaveText("Current: fixture");
  await expect(page.getByTestId("catalog-status-theclawbay")).toContainText("Catalog not loaded");
  await expect(page.getByTestId("catalog-status-deepseek")).toContainText("Catalog not loaded");
  // Untested or uncached models cannot be chosen; only the fixture is offered.
  await expect(page.locator('input[name="drafter"]')).toHaveCount(1);
  await page.getByTestId("choose-drafter").click();
  await expect(page.getByTestId("form-success")).toHaveText("Drafter saved.");
  await expect(page.locator("body")).not.toContainText("sk-");
});
