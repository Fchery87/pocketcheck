import { error, json } from "@sveltejs/kit";
import * as env from "$app/env/private";
import { now, researchStore, settingsStore } from "#lib/server/config.ts";
import { assertBrowserFixture } from "#lib/server/verification.ts";

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
    model: env.POCKETCHECK_MODEL_ARTIFACT,
    drafter: drafter.provider,
    analyses: (await researchStore().listCompleted()).length,
  });
}
