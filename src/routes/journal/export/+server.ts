import { error } from "@sveltejs/kit";
import { ConfigError, researchStore } from "#lib/server/config.ts";
import type { RequestHandler } from "./$types";

/** Version 1 journal backup from the same journal the application reads. */
export const GET: RequestHandler = async () => {
  try {
    const backup = await researchStore().exportJournal();
    return new Response(JSON.stringify(backup), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="pocketcheck-journal-v1.json"',
      },
    });
  } catch (cause) {
    if (cause instanceof ConfigError) error(503, cause.message);
    throw cause;
  }
};
