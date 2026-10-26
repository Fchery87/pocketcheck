import * as env from "$app/env/private";
import { assertBrowserFixture } from "#lib/server/verification.ts";

export function init(): void {
  if (env.POCKETCHECK_TEST_MODE) assertBrowserFixture(env);
}
