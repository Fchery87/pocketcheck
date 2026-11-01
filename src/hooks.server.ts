import type { Handle } from "@sveltejs/kit/hooks";
import * as env from "$app/env/private";
import { assertBrowserFixture } from "#lib/server/verification.ts";
import { parseTheme, THEME_COOKIE, themeAttribute } from "#lib/theme.ts";
import { runtimeAccess, SESSION_COOKIE } from "#lib/server/access.ts";

export function init(): void {
  if (env.POCKETCHECK_TEST_MODE) assertBrowserFixture(env);
  runtimeAccess(env);
}

// The theme is applied on the server so the first paint already uses it.
export const handle: Handle = async ({ event, resolve }) => {
  const access = runtimeAccess(env);
  if (!access.permits(event.url.pathname, event.cookies.get(SESSION_COOKIE))) {
    if (event.request.method === "GET" && !event.isDataRequest) {
      return new Response(null, {
        status: 303,
        headers: { location: "/login", "cache-control": "no-store" },
      });
    }
    return new Response("Sign in to PocketCheck first.", {
      status: 401,
      headers: { "cache-control": "no-store" },
    });
  }
  const theme = parseTheme(event.cookies.get(THEME_COOKIE));
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replace("%pocketcheck.theme%", themeAttribute(theme)),
  });
  response.headers.set("cache-control", "no-store");
  return response;
};
