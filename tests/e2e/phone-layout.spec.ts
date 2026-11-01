import { expect, test } from "./fixture.ts";
import { browserPorts } from "../../scripts/browser-port.ts";

const THEMES = ["light", "dark"] as const;

test.use({ viewport: { width: 390, height: 844 } });

test("390px pages have no horizontal overflow in either theme", async ({
  page,
  request,
  context,
}) => {
  const origin = browserPorts(process.env).origin;
  expect((await request.post("/__verification", { headers: { origin } })).ok()).toBe(true);
  const fixture = await (await request.get("/__verification")).json();

  await page.goto("/journal");
  await page.getByTestId("protocol-checksum").fill(fixture.model.checksum);
  await page
    .getByTestId("protocol-form")
    .getByRole("button", { name: "Register evaluation" })
    .click();
  await expect(page.getByTestId("protocol-registrations")).toContainText(fixture.model.checksum);

  await page.goto("/board");
  await page.getByTestId("board-game").selectOption("2026_07_DAL_PHI");
  await page.getByTestId("board-sportsbook").fill("Phone Book");
  await page.getByTestId("board-observed-at").fill("2026-10-25T11:30");
  await page.getByTestId("moneyline-home").fill("-150");
  await page.getByTestId("moneyline-away").fill("+130");
  await page.getByTestId("board-tie-rule").selectOption("push");
  await page.getByTestId("freeze-board").click();
  await expect(page.getByTestId("board-status")).toHaveText("completed");
  const boardPath = new URL(page.url()).pathname;

  const paths = ["/", "/board", "/journal", boardPath, "/board/performance", "/settings"];
  for (const theme of THEMES) {
    await context.addCookies([{ name: "pocketcheck-theme", value: theme, url: origin }]);
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${theme} ${path}`).toBeLessThanOrEqual(0);
    }
  }
});
