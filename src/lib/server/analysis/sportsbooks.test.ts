import { expect, it } from "vite-plus/test";
import { sportsbooksOf } from "./sportsbooks.ts";

it("lists each distinct sportsbook once, sorted, and skips empty names", () => {
  expect(
    sportsbooksOf([{ sportsbook: "FanDuel" }, { sportsbook: "draftkings" }], undefined, [
      { sportsbook: "FanDuel" },
      { sportsbook: "" },
    ]),
  ).toEqual(["FanDuel", "draftkings"]);
});
