import { error } from "@sveltejs/kit";
import { encodeJournalBackup } from "#lib/server/analysis/journal-backup.ts";
import { ConfigError, configuredSecrets, researchStore } from "#lib/server/config.ts";
import type { RequestHandler } from "./$types";

/** Version 1 journal backup from the same journal the application reads. */
export const GET: RequestHandler = async () => {
  try {
    const backup = encodeJournalBackup(await researchStore().exportJournal(), {
      secrets: configuredSecrets(),
    });
    return new Response(backup, {
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
