import { resolve } from "node:path";
import {
  DATABASE_URL,
  POCKETCHECK_JOURNAL,
  POCKETCHECK_NOW,
  POCKETCHECK_SCHEDULE_CSV,
} from "$app/env/private";
import { createDb } from "./db/client.ts";
import { createNeonStore } from "./analysis/neon-store.ts";
import { createMemoryStore, type ResearchStore } from "./analysis/store.ts";

/**
 * Runtime configuration. Only routes import this module: it reads SvelteKit's
 * private environment (declared in src/env.ts), which plain Node scripts and unit
 * tests cannot import.
 *
 * POCKETCHECK_JOURNAL=memory, POCKETCHECK_NOW, and POCKETCHECK_SCHEDULE_CSV exist
 * so the browser suite is deterministic. Normal use sets none of them.
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
