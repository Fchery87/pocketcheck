import { fail, redirect } from "@sveltejs/kit";
import * as env from "$app/env/private";
import { runtimeAccess, SESSION_COOKIE, SESSION_SECONDS } from "#lib/server/access.ts";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ cookies, setHeaders }) => {
  setHeaders({ "cache-control": "no-store" });
  if (runtimeAccess(env).authenticated(cookies.get(SESSION_COOKIE))) redirect(303, "/");
};

export const actions: Actions = {
  default: async ({ request, cookies, url, getClientAddress }) => {
    if (request.headers.get("origin") !== url.origin)
      return fail(403, { message: "Sign in from this PocketCheck address." });
    if (Number(request.headers.get("content-length")) > 4096)
      return fail(413, { message: "Sign-in form is too large." });
    if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded")
      return fail(415, { message: "Use the sign-in form." });
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return fail(413, { message: "Sign-in form is too large." });
        }
        chunks.push(chunk.value);
      }
    }
    const data = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    const secret = data.get("secret");
    const result = runtimeAccess(env).login(
      typeof secret === "string" ? secret : "",
      getClientAddress(),
    );
    if (result.status === "limited")
      return fail(429, { message: "Too many sign-in attempts. Try again in 15 minutes." });
    if (result.status !== "authenticated")
      return fail(401, { message: "Access secret not accepted." });
    cookies.set(SESSION_COOKIE, result.session, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: url.protocol === "https:",
      maxAge: SESSION_SECONDS,
      expires: new Date(Date.now() + SESSION_SECONDS * 1000),
    });
    redirect(303, "/");
  },
};
