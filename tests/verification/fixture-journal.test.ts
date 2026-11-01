import { expect, it } from "vite-plus/test";
import { resetFixtureJournal, type FixtureJournalClient } from "../e2e/fixture-journal.ts";

function client(identity: string) {
  const calls: string[] = [];
  const request: FixtureJournalClient = {
    async get(path) {
      calls.push(`GET ${path}`);
      return {
        ok: () => true,
        json: async () => ({ mode: "fixture-browser", journal: { kind: "memory", identity } }),
      };
    },
    async post(path, options) {
      calls.push(`POST ${path} ${options.headers.origin}`);
      return { ok: () => true, json: async () => ({ analyses: 0 }) };
    },
  };
  return { request, calls };
}

it("checks journal identity before the reset mutation", async () => {
  const fixture = client("browser-this-run");
  await resetFixtureJournal(fixture.request, "browser-this-run", "http://127.0.0.1:42627");
  expect(fixture.calls).toEqual([
    "GET /__verification",
    "POST /__verification http://127.0.0.1:42627",
  ]);
});

it("does not mutate a different run's fixture journal", async () => {
  const fixture = client("browser-another-run");
  await expect(
    resetFixtureJournal(fixture.request, "browser-this-run", "http://127.0.0.1:42627"),
  ).rejects.toThrow();
  expect(fixture.calls).toEqual(["GET /__verification"]);
});

it("requires a run identity before contacting the fixture server", async () => {
  const fixture = client("browser-this-run");
  await expect(
    resetFixtureJournal(fixture.request, undefined, "http://127.0.0.1:42627"),
  ).rejects.toThrow("A browser journal identity is required");
  expect(fixture.calls).toEqual([]);
});
