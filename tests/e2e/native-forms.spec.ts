import { test, expect } from "./fixture.ts";
import { browserPorts } from "../../scripts/browser-port.ts";

test.use({ javaScriptEnabled: false });

test("native refresh saves edited terms and preserves the parent snapshot", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByTestId("game-id").selectOption("2026_07_DAL_PHI");
  await page.getByLabel("Sportsbook", { exact: true }).fill("Native research book");
  await page.getByTestId("american-odds").fill("-110");
  await page.getByTestId("opposing-american-odds").fill("-110");
  await page.getByTestId("observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("analyze").click();
  await expect(page).toHaveURL(/\/analysis\//);
  const parentId = new URL(page.url()).pathname.split("/").at(-1);
  const before = await (await request.get("/journal/export")).json();
  const parent = before.analyses.find((row: { id: string }) => row.id === parentId);
  await page.getByTestId("refresh-book").fill("Native refresh book");
  await page.getByTestId("refresh-odds").fill("-105");
  await page.getByTestId("refresh-opposing-odds").fill("-115");
  await page.getByTestId("refresh-observed-at").fill("2026-10-25T11:45");
  await page.getByTestId("refresh").click();
  await expect(page).not.toHaveURL(new RegExp(`${parentId}$`));
  const after = await (await request.get("/journal/export")).json();
  const child = after.analyses.find((row: { parentId: string }) => row.parentId === parentId);
  expect(child).toBeTruthy();
  const offer = after.offers.find((row: { id: string }) => row.id === child.offerId);
  expect(offer).toMatchObject({
    sportsbook: "Native refresh book",
    americanOdds: -105,
    observedAt: "2026-10-25T15:45:00.000Z",
    opposing: { americanOdds: -115 },
  });
  expect(after.analyses.find((row: { id: string }) => row.id === parentId)).toEqual(parent);
});

test("native settlement failure stays scoped and preserves values through Back", async ({
  page,
}) => {
  await page.goto("/journal");
  await page.getByTestId("settle-event").fill("native-event");
  await page.getByTestId("settle-home").fill("27");
  await page.getByTestId("settle-away").fill("14");
  await page.getByTestId("settle-reason").fill("entered reason");
  await page.getByRole("button", { name: "Record settlement", exact: true }).click();
  await expect(page.getByTestId("settlement-form-error")).toHaveText(
    "Choose the analysis or the bet to settle",
  );
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByTestId("settle-event")).toHaveValue("native-event");
  await expect(page.getByTestId("settle-home")).toHaveValue("27");
  await expect(page.getByTestId("settle-reason")).toHaveValue("entered reason");
  await expect(page.getByTestId("bet-recorded")).toHaveCount(0);
  await expect(page.getByTestId("closing-recorded")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("button", { name: "Record settlement", exact: true })).toBeEnabled();
  await page.getByTestId("settle-event").fill("native-event-resubmitted");
  await page.getByTestId("settle-home").fill("27");
  await page.getByTestId("settle-away").fill("14");
  await page.getByRole("button", { name: "Record settlement", exact: true }).click();
  await expect(page.getByTestId("settlement-form-error")).toHaveCount(1);
});

test("native protocol success cannot announce a bet or closing", async ({ page }) => {
  await page.goto("/journal");
  await page.getByTestId("protocol-checksum").fill("a".repeat(64));
  await page.getByRole("button", { name: "Register evaluation", exact: true }).click();
  await expect(page.getByTestId("protocol-recorded")).toHaveCount(1);
  await expect(page.getByTestId("bet-recorded")).toHaveCount(0);
  await expect(page.getByTestId("closing-recorded")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("invalid closing date returns one field failure without crashing", async ({ request }) => {
  const response = await request.post("/journal?/closing", {
    headers: {
      origin: browserPorts(process.env).origin,
      accept: "application/json",
      "x-sveltekit-action": "true",
    },
    form: {
      observedAt: "2026-02-30T12:00",
      sportsbook: "Preserved book",
      source: "Preserved source",
    },
  });
  expect(response.status()).toBe(400);
  const result = await response.json();
  expect(result).toMatchObject({ type: "failure", status: 400 });
  expect(result.data).toContain("observedAt");
  expect(result.data).toContain("Preserved book");
  expect(result.data).toContain("America/New_York");
});
