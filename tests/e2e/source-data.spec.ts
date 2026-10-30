import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const FIXTURES = [
  "tests/fixtures/sources/games-minimized.csv",
  "tests/fixtures/sources/injuries-2026-live-sample.csv",
];

test("settings shows how old each source file is and refuses downloads in verification", async ({
  page,
}) => {
  const before = FIXTURES.map((path) => readFileSync(path, "utf8"));
  await page.goto("/settings");

  const schedule = page.getByTestId("source-schedule");
  await expect(schedule).toContainText("Retrieved");
  await expect(schedule).toContainText("4 hours ago");
  await expect(schedule).toContainText("Rows unknown");
  const injuries = page.getByTestId("source-injuries");
  await expect(injuries).toContainText("4 hours ago");
  await expect(injuries).not.toContainText("Stale");

  const playByPlay = page.getByTestId("source-play-by-play");
  await expect(playByPlay).toContainText("npm run data:play-by-play");
  await expect(playByPlay.getByRole("button")).toHaveCount(0);

  await injuries.getByRole("button", { name: "Download the injury report" }).click();
  await expect(page.getByTestId("form-error")).toContainText("Downloads are off in verification");
  expect(FIXTURES.map((path) => readFileSync(path, "utf8"))).toEqual(before);
});
