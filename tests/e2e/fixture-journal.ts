import assert from "node:assert/strict";

interface FixtureResponse {
  ok(): boolean;
  json(): Promise<unknown>;
}

export interface FixtureJournalClient {
  get(path: string): Promise<FixtureResponse>;
  post(path: string, options: { headers: { origin: string } }): Promise<FixtureResponse>;
}

export async function resetFixtureJournal(
  request: FixtureJournalClient,
  identity: string | undefined,
  origin: string,
): Promise<void> {
  assert(identity?.startsWith("browser-"), "A browser journal identity is required");
  const response = await request.get("/__verification");
  assert(response.ok(), "Fixture verification must succeed before reset");
  const fixture = await response.json();
  assert(fixture && typeof fixture === "object" && "mode" in fixture);
  assert.equal(fixture.mode, "fixture-browser");
  assert("journal" in fixture);
  assert.deepEqual(fixture.journal, { kind: "memory", identity });
  const reset = await request.post("/__verification", { headers: { origin } });
  assert(reset.ok(), "Fixture journal reset must succeed");
  assert.deepEqual(await reset.json(), { analyses: 0 });
}
