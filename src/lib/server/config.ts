import { resolve } from "node:path";
import {
  DATABASE_URL,
  NWS_USER_AGENT,
  POCKETCHECK_INJURY_CSV,
  POCKETCHECK_JOURNAL,
  POCKETCHECK_NOW,
  POCKETCHECK_SCHEDULE_CSV,
  POCKETCHECK_WEATHER,
} from "$app/env/private";
import { createDb } from "./db/client.ts";
import { createSourceCollector, type EvidenceCollector } from "./analysis/evidence.ts";
import { createNeonStore } from "./analysis/neon-store.ts";
import { createMemoryStore, type ResearchStore } from "./analysis/store.ts";
import { fetchKickoffForecast } from "./sources/nws.ts";

/**
 * Runtime configuration. Only routes import this module: it reads SvelteKit's
 * private environment (declared in src/env.ts), which plain Node scripts and unit
 * tests cannot import.
 *
 * POCKETCHECK_JOURNAL=memory, POCKETCHECK_NOW, POCKETCHECK_SCHEDULE_CSV,
 * POCKETCHECK_INJURY_CSV, and POCKETCHECK_WEATHER=off exist so the browser suite is
 * deterministic and offline. Normal use sets none of them.
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function now(): string {
  return POCKETCHECK_NOW ? new Date(POCKETCHECK_NOW).toISOString() : new Date().toISOString();
}

export function schedulePath(): string {
  return resolve(POCKETCHECK_SCHEDULE_CSV || "data/sources/games.csv");
}

/** Injuries from the file npm run data:injuries keeps; the kickoff forecast live from NWS. */
export function evidenceCollector(): EvidenceCollector {
  return createSourceCollector({
    injuryPath: (season) =>
      resolve(POCKETCHECK_INJURY_CSV || `data/sources/injuries_${season}.csv`),
    weather:
      POCKETCHECK_WEATHER === "off"
        ? async () => ({
            state: "missing",
            item: null,
            reason: "Weather collection is off (POCKETCHECK_WEATHER=off).",
          })
        : (game, nowIso) =>
            fetchKickoffForecast({
              game,
              nowIso,
              fetch,
              userAgent: NWS_USER_AGENT || "PocketCheck/0.1 (personal NFL research)",
            }),
  });
}

let store: ResearchStore | undefined;

/** The journal. Neon unless the memory journal is explicitly requested; never a silent fallback. */
export function researchStore(): ResearchStore {
  if (store) return store;
  if (POCKETCHECK_JOURNAL === "memory") {
    store = createMemoryStore();
    return store;
  }
  if (!DATABASE_URL) {
    throw new ConfigError(
      "DATABASE_URL is not set. Add your Neon connection string to .env and run npm run db:migrate.",
    );
  }
  store = createNeonStore(createDb(DATABASE_URL));
  return store;
}
