import type { Handle } from "@sveltejs/kit/hooks";
import * as env from "$app/env/private";
import { assertBrowserFixture } from "#lib/server/verification.ts";
import { parseTheme, THEME_COOKIE, themeAttribute } from "#lib/theme.ts";

export function init(): void {
  if (env.POCKETCHECK_TEST_MODE) assertBrowserFixture(env);
}

// The theme is applied on the server so the first paint already uses it.
export const handle: Handle = async ({ event, resolve }) => {
  const theme = parseTheme(event.cookies.get(THEME_COOKIE));
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace("%pocketcheck.theme%", themeAttribute(theme)),
  });
};
