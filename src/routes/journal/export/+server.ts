import { error } from "@sveltejs/kit";
import { ConfigError, databaseForJournal } from "#lib/server/config.ts";
import { JournalRepository } from "#lib/server/db/repository.ts";
import type { RequestHandler } from "./$types";

/** Version 1 journal backup. Credentials and settings are not part of this response. */
export const GET: RequestHandler = async () => {
  try {
    const backup = await new JournalRepository(databaseForJournal()).exportJournal();
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
