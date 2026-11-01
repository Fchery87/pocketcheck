import { fail, redirect } from "@sveltejs/kit";
import { SESSION_COOKIE } from "#lib/server/access.ts";
import type { Actions } from "./$types";

export const actions: Actions = {
  default: ({ request, url, cookies }) => {
    if (request.headers.get("origin") !== url.origin)
      return fail(403, { message: "Sign out from this PocketCheck address." });
    cookies.delete(SESSION_COOKIE, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: url.protocol === "https:",
    });
    redirect(303, "/login");
  },
};
