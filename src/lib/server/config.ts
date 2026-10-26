import { resolve } from "node:path";
import {
  DATABASE_URL,
  DEEPSEEK_API_KEY,
  NWS_USER_AGENT,
  POCKETCHECK_INJURY_CSV,
  POCKETCHECK_JOURNAL,
  POCKETCHECK_MODEL_ARTIFACT,
  POCKETCHECK_NOW,
  POCKETCHECK_SCHEDULE_CSV,
  POCKETCHECK_WEATHER,
  THECLAWBAY_API_KEY,
} from "$app/env/private";
import { createDb, type Db } from "./db/client.ts";
import { createSourceCollector, type EvidenceCollector } from "./analysis/evidence.ts";
import { createArtifactModel, type ModelSource } from "./analysis/model.ts";
import { createNeonStore } from "./analysis/neon-store.ts";
import { createMemoryStore, type ResearchStore } from "./analysis/store.ts";
import type { ProviderId, ThesisDrafter, ThesisProvider } from "./providers/contracts.ts";
import { createDeepSeekProvider } from "./providers/deepseek.ts";
import { resolveDrafter } from "./providers/drafter.ts";
import { createTheClawBayProvider } from "./providers/theclawbay.ts";
import { createNeonSettings } from "./settings/neon-settings.ts";
import { createMemorySettings, type SettingsStore } from "./settings/store.ts";
import { fetchKickoffForecast } from "./sources/nws.ts";

/**
 * Runtime configuration. Only routes import this module: it reads SvelteKit's
 * private environment (declared in src/env.ts), which plain Node scripts and unit
 * tests cannot import.
 *
 * POCKETCHECK_JOURNAL=memory, POCKETCHECK_NOW, POCKETCHECK_SCHEDULE_CSV,
 * POCKETCHECK_INJURY_CSV, POCKETCHECK_WEATHER=off, and POCKETCHECK_MODEL_ARTIFACT=off exist so the browser suite is
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

/** The fitted artifact npm run model:fit writes, read fresh for each run. */
export function modelSource(): ModelSource {
  if (POCKETCHECK_MODEL_ARTIFACT === "off") {
    return async () => ({
      status: "unavailable",
      reason: "The model is off (POCKETCHECK_MODEL_ARTIFACT=off).",
    });
  }
  return createArtifactModel({
    artifactPath: resolve(POCKETCHECK_MODEL_ARTIFACT || "data/artifacts/baseline.json"),
    schedulePath: schedulePath(),
  });
}

let db: Db | undefined;

function database(): Db {
  if (db) return db;
  if (!DATABASE_URL) {
    throw new ConfigError(
      "DATABASE_URL is not set. Add your Neon connection string to .env and run npm run db:migrate.",
    );
  }
  db = createDb(DATABASE_URL);
  return db;
}

let store: ResearchStore | undefined;

/** The journal. Neon unless the memory journal is explicitly requested; never a silent fallback. */
export function researchStore(): ResearchStore {
  store ??= POCKETCHECK_JOURNAL === "memory" ? createMemoryStore() : createNeonStore(database());
  return store;
}

let settings: SettingsStore | undefined;

/** Non-secret settings, kept beside the journal. */
export function settingsStore(): SettingsStore {
  settings ??=
    POCKETCHECK_JOURNAL === "memory" ? createMemorySettings() : createNeonSettings(database());
  return settings;
}

/** Keys are read here and handed to provider adapters; nothing else sees them. */
export function providerKeys(): Partial<Record<ProviderId, string>> {
  return { theclawbay: THECLAWBAY_API_KEY, deepseek: DEEPSEEK_API_KEY };
}

export function makeProvider(id: ProviderId, apiKey: string): ThesisProvider {
  return id === "theclawbay"
    ? createTheClawBayProvider({ apiKey })
    : createDeepSeekProvider({ apiKey });
}

/** The drafter chosen in Settings, or the reason it cannot be used. */
export function thesisDrafter(): Promise<
  { ok: true; drafter: ThesisDrafter } | { ok: false; error: string }
> {
  return resolveDrafter({ settings: settingsStore(), keys: providerKeys(), makeProvider });
}
