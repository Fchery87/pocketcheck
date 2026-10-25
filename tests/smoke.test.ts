import { fixtureGameName } from "#lib/server/fixtures.ts";
import { actions, load } from "../src/routes/+page.server";
import { describe, expect, it } from "vite-plus/test";

describe("fixture game action", () => {
  it("returns the fixture game name from the page load", () => {
    const result = load({} as never);
    expect(result.gameName).toBe(fixtureGameName);
    expect(result.games.length).toBeGreaterThan(0);
  });

  it("keeps the fixture game name available without a default action", () => {
    expect(actions.analyze).toBeTypeOf("function");
    expect(fixtureGameName).toBe("Fixture Away at Fixture Home");
  });
});
