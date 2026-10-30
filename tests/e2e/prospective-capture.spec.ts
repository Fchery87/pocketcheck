import { expect, test } from "@playwright/test";
import { browserPorts } from "../../scripts/browser-port.ts";

test.afterEach(async ({ request }) => {
  const origin = browserPorts(process.env).origin;
  expect((await request.post("/__verification", { headers: { origin } })).ok()).toBe(true);
});

test("a contradictory explanation fails visibly without replacing the frozen pick", async ({
  page,
  request,
}) => {
  const origin = browserPorts(process.env).origin;
  expect((await request.post("/__verification", { headers: { origin } })).ok()).toBe(true);
  expect(
    (
      await request.patch("/__verification", {
        headers: { origin },
        data: { contradictoryDraft: true },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/board");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill("Contradiction Book");
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("total-line").fill("44.5");
  await page.getByTestId("total-over").fill("-110");
  await page.getByTestId("total-under").fill("-110");
  await page.getByTestId("freeze-board").click();
  await expect(page.getByTestId("board-status")).toHaveText("failed");
  const backup = await (await request.get("/journal/export")).json();
  const board = backup.gameBoards[0];
  expect(board.failureReason).toMatch(/frozen fact references|unsupported contract/);
  expect(board.explanation).toBeNull();
  expect(board.markets[0].pick).not.toBeNull();
  expect(board.markets[0].offers.map((offer: { pointLine: number }) => offer.pointLine)).toEqual([
    44.5, 44.5,
  ]);
  await page.reload();
  await expect(page.getByTestId("model-pick-total")).toBeVisible();
  expect((await (await request.get("/journal/export")).json()).gameBoards).toEqual(
    backup.gameBoards,
  );
});

test("a registration and two-sided closing market survive export and restore", async ({
  page,
  request,
}) => {
  const origin = browserPorts(process.env).origin;
  expect((await request.post("/__verification", { headers: { origin } })).ok()).toBe(true);
  const fixture = await (await request.get("/__verification")).json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/journal");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await page.getByTestId("protocol-checksum").fill(fixture.model.checksum);
  expect(
    await page
      .getByTestId("protocol-checksum")
      .evaluate((element: HTMLInputElement) => element.validity.valid),
  ).toBe(true);
  await page
    .getByTestId("protocol-form")
    .getByRole("button", { name: "Register evaluation" })
    .click();
  await expect(page.getByTestId("protocol-recorded")).toBeVisible();
  await expect(page.getByTestId("protocol-registrations")).toContainText(fixture.model.checksum);

  await page.goto("/board");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-protocol").selectOption({ index: 1 });
  await page.getByTestId("board-sportsbook").fill("Snapshot Book");
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("moneyline-away").fill("+130");
  await page.getByTestId("board-tie-rule").selectOption("push");
  await page.getByTestId("freeze-board").click();
  await expect(page.getByTestId("board-error")).toContainText(
    "after registration and within the evaluation period",
  );
  await page.getByTestId("board-protocol").selectOption("");
  await page.getByTestId("freeze-board").click();
  await expect(page.getByTestId("board-status")).toHaveText("completed");

  await page.goto("/journal");
  await page.getByTestId("closing-market-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("closing-market-book").fill("Snapshot Book");
  await page.getByTestId("closing-market-first").fill("-140");
  await page.getByTestId("closing-market-second").fill("+120");
  await page.getByTestId("closing-market-tie").selectOption("push");
  await page.getByTestId("closing-market-time").fill("2026-10-25T11:45");
  await page.getByTestId("closing-market-source").fill("Saved sportsbook quote");
  await page
    .getByTestId("closing-market-form")
    .getByRole("button", { name: "Record closing market" })
    .click();
  await expect(page.getByTestId("closing-market-recorded")).toBeVisible();

  const backup = await (await request.get("/journal/export")).json();
  const board = backup.gameBoards.find(
    (item: { sportsbook: string }) => item.sportsbook === "Snapshot Book",
  );
  expect(board.request.protocolRegistrationId).toBeUndefined();
  expect(board.markets[0].pick.forecast.protocolRegistrationId).toBeUndefined();
  expect(backup.closingMarketSnapshots[0]).toMatchObject({
    gameId: "2026_07_DAL_PHI",
    market: "moneyline",
    source: "Saved sportsbook quote",
  });
  expect(
    backup.closingMarketSnapshots[0].offers.map(
      (offer: { americanOdds: number }) => offer.americanOdds,
    ),
  ).toEqual([-140, 120]);

  expect((await request.post("/__verification", { headers: { origin } })).ok()).toBe(true);
  await page.goto("/journal");
  await page.getByTestId("restore-file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole("button", { name: "Restore journal" }).click();
  await expect(page.getByTestId("restore-recorded")).toBeVisible();
  await expect(page.getByTestId("protocol-registrations")).toContainText(fixture.model.checksum);
  await expect(page.getByTestId("closing-markets")).toContainText("Saved sportsbook quote");
});

test("a later board keeps its prospective registration through capture and restore", async ({
  page,
  request,
}) => {
  const origin = browserPorts(process.env).origin;
  expect(
    (
      await request.post("/__verification", {
        headers: { origin },
        data: { now: "2026-10-27T16:00:00.000Z" },
      })
    ).ok(),
  ).toBe(true);
  const fixture = await (await request.get("/__verification")).json();
  await page.goto("/journal");
  await page.getByTestId("protocol-checksum").fill(fixture.model.checksum);
  await page
    .getByTestId("protocol-form")
    .getByRole("button", { name: "Register evaluation" })
    .click();
  await expect(page.getByTestId("protocol-recorded")).toBeVisible();
  expect(
    (
      await request.patch("/__verification", {
        headers: { origin },
        data: { now: "2026-10-28T16:00:00.000Z" },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/board");
  await page.getByTestId("board-game").selectOption("2026_08_BAL_BUF");
  await page.getByTestId("board-protocol").selectOption({ index: 1 });
  await page.getByTestId("board-sportsbook").fill("Prospective Book");
  await page.getByTestId("board-observed-at").fill("2026-10-28T11:30");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("moneyline-away").fill("+130");
  await page.getByTestId("board-tie-rule").selectOption("push");
  await page.getByTestId("freeze-board").click();
  await expect(page.getByTestId("board-status")).toHaveText("completed");
  const backup = await (await request.get("/journal/export")).json();
  const registration = backup.protocolRegistrations[0];
  const board = backup.gameBoards[0];
  expect(registration.registeredAt).toBe("2026-10-27T16:00:00.000Z");
  expect(board.cutoffAt).toBe("2026-10-28T16:00:00.000Z");
  expect(board.request.protocolRegistrationId).toBe(registration.id);
  expect(board.markets[0].pick.forecast.protocolRegistrationId).toBe(registration.id);
  expect(board.markets[0].pick.forecast.artifact.checksum).toBe(
    registration.protocol.artifactChecksum,
  );
  expect((await request.post("/__verification", { headers: { origin } })).ok()).toBe(true);
  await page.goto("/journal");
  await page.getByTestId("restore-file").setInputFiles({
    name: "registered.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole("button", { name: "Restore journal" }).click();
  await expect(page.getByTestId("restore-recorded")).toBeVisible();
  const restored = await (await request.get("/journal/export")).json();
  expect(restored.protocolRegistrations).toEqual(backup.protocolRegistrations);
  expect(restored.gameBoards).toEqual(backup.gameBoards);
});
