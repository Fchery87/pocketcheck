import { error, json } from "@sveltejs/kit";
import * as env from "$app/env/private";
import { createMemoryStore } from "#lib/server/analysis/store.ts";
import {
  now,
  replaceMemoryJournal,
  researchStore,
  settingsStore,
  setVerificationClock,
  setVerificationContradiction,
} from "#lib/server/config.ts";
import { assertBrowserFixture, browserFixtureModel } from "#lib/server/verification.ts";

export async function GET() {
  if (!env.POCKETCHECK_TEST_MODE) error(404);
  assertBrowserFixture(env);
  const drafter = await settingsStore().getDrafter();
  if (drafter.provider !== "fixture") error(503, "Browser verification requires fixture drafter");
  return json({
    mode: env.POCKETCHECK_TEST_MODE,
    now: now(),
    journal: { kind: env.POCKETCHECK_JOURNAL, identity: env.POCKETCHECK_TEST_JOURNAL_ID },
    schedule: env.POCKETCHECK_SCHEDULE_CSV,
    injuries: env.POCKETCHECK_INJURY_CSV,
    weather: env.POCKETCHECK_WEATHER,
    model: browserFixtureModel(),
    drafter: drafter.provider,
    analyses: (await researchStore().listCompleted()).length,
  });
}

/** Test-only empty journal. The route does not exist outside browser verification. */
export async function POST({ request }: { request: Request }) {
  if (!env.POCKETCHECK_TEST_MODE) error(404);
  assertBrowserFixture(env);
  let clock: string | null = null;
  if (request.headers.get("content-type")?.includes("application/json")) {
    const input: unknown = await request.json();
    if (
      !input ||
      typeof input !== "object" ||
      !("now" in input) ||
      typeof input.now !== "string" ||
      !Number.isFinite(Date.parse(input.now))
    ) {
      error(400, "A fixture clock requires a valid timestamp.");
    }
    clock = input.now;
  }
  setVerificationClock(clock);
  setVerificationContradiction(false);
  replaceMemoryJournal(createMemoryStore({ now }));
  return json({ analyses: (await researchStore().listCompleted()).length });
}

export async function PATCH({ request }: { request: Request }) {
  if (!env.POCKETCHECK_TEST_MODE) error(404);
  assertBrowserFixture(env);
  const input: unknown = await request.json();
  if (
    input &&
    typeof input === "object" &&
    "contradictoryDraft" in input &&
    typeof input.contradictoryDraft === "boolean"
  ) {
    setVerificationContradiction(input.contradictoryDraft);
    return json({ contradictoryDraft: input.contradictoryDraft });
  }
  if (
    !input ||
    typeof input !== "object" ||
    !("now" in input) ||
    typeof input.now !== "string" ||
    !Number.isFinite(Date.parse(input.now))
  ) {
    error(400, "A fixture clock requires a valid timestamp.");
  }
  if (Date.parse(input.now) <= Date.parse(now())) error(400, "The fixture clock must advance.");
  setVerificationClock(input.now);
  return json({ now: now() });
}
