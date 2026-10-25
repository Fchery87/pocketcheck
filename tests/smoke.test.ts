import { fixtureGameName } from "#lib/server/fixtures.ts";
import { actions, load } from "../src/routes/+page.server";
import { describe, expect, it } from "vite-plus/test";

describe("fixture game action", () => {
  it("returns the fixture game name from the page load", () => {
    expect(load({} as never)).toEqual({ gameName: fixtureGameName });
  });

  it("returns the fixture game name from the default action", async () => {
    const result = await actions.default({} as never);
    expect(result).toEqual({ gameName: "Fixture Away at Fixture Home" });
  });
});
