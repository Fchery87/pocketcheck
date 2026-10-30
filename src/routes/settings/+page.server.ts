import { relative } from "node:path";
import { error, fail } from "@sveltejs/kit";
import { easternTime } from "#lib/format.ts";
import {
  ConfigError,
  makeProvider,
  now,
  providerKeys,
  settingsStore,
  sourceDownloadsEnabled,
  sourcePath,
} from "#lib/server/config.ts";
import { redactText } from "#lib/server/analysis/redact.ts";
import {
  applyModelTests,
  ProviderError,
  type ProviderId,
} from "#lib/server/providers/contracts.ts";
import { PROVIDER_KEY_NAMES, PROVIDER_LABELS } from "#lib/server/providers/drafter.ts";
import { selectThesisModel } from "#lib/server/providers/selection.ts";
import { chooseDrafter } from "#lib/server/settings/choose.ts";
import {
  downloadSource,
  seasonOf,
  SOURCES,
  sourceStatus,
  type SourceId,
} from "#lib/server/sources/downloads.ts";
import type { Actions, PageServerLoad } from "./$types";

const PROVIDERS: ProviderId[] = ["theclawbay", "deepseek"];

const SOURCE_TITLES: Record<SourceId, string> = {
  schedule: "Schedule",
  injuries: "Injury report",
  "depth-charts": "Depth chart",
  "play-by-play": "Play-by-play",
};

function settings() {
  try {
    return settingsStore();
  } catch (cause) {
    if (cause instanceof ConfigError) error(503, cause.message);
    throw cause;
  }
}

function providerField(data: FormData): ProviderId | null {
  const value = String(data.get("provider") ?? "");
  return PROVIDERS.includes(value as ProviderId) ? (value as ProviderId) : null;
}

export const load: PageServerLoad = async () => {
  const store = settings();
  const keys = providerKeys();
  const providers = await Promise.all(
    PROVIDERS.map(async (id) => {
      const catalog = await store.getCatalog(id);
      const tests = await store.getModelTests(id);
      const entries = applyModelTests(catalog?.entries ?? [], tests);
      return {
        id,
        label: PROVIDER_LABELS[id],
        keyName: PROVIDER_KEY_NAMES[id],
        // Only whether a key is set; the key itself never leaves the server.
        keyConfigured: Boolean(keys[id]),
        baseUrl: makeProvider(id, "unused").baseUrl,
        retrievedAt: catalog ? easternTime(catalog.retrievedAt) : null,
        preferredId: selectThesisModel(entries, { provider: id }).preferredId,
        entries: entries.map((entry) => ({
          ...entry,
          testedAt: tests[entry.id] ? easternTime(tests[entry.id]!.testedAt) : null,
        })),
      };
    }),
  );
  const current = now();
  const season = seasonOf(current);
  const sources = (Object.keys(SOURCES) as SourceId[]).map((id) => {
    const path = sourcePath(id, season);
    const status = sourceStatus(id, path, current);
    return {
      id,
      title: SOURCE_TITLES[id],
      file: relative(process.cwd(), path),
      command: SOURCES[id].command,
      downloadable: SOURCES[id].settings,
      staleAfterHours: SOURCES[id].staleAfterHours,
      status:
        status.state === "missing"
          ? status
          : { ...status, retrievedLabel: easternTime(status.retrievedAt) },
    };
  });
  return { drafter: await store.getDrafter(), providers, season, sources };
};

export const actions = {
  refresh: async ({ request }) => {
    const provider = providerField(await request.formData());
    if (!provider) return fail(400, { error: "Unknown provider" });
    const apiKey = providerKeys()[provider];
    if (!apiKey) return fail(400, { error: `${PROVIDER_KEY_NAMES[provider]} is not set` });
    try {
      await settings().saveCatalog(await makeProvider(provider, apiKey).discoverModels());
    } catch (cause) {
      if (!(cause instanceof ProviderError)) throw cause;
      return fail(502, {
        error: `${PROVIDER_LABELS[provider]} catalog refresh failed: ${redactText(cause.message)}`,
      });
    }
    return { refreshed: PROVIDER_LABELS[provider] };
  },

  test: async ({ request }) => {
    const data = await request.formData();
    const provider = providerField(data);
    const modelId = String(data.get("modelId") ?? "");
    if (!provider || !modelId) return fail(400, { error: "Choose a model to test" });
    const apiKey = providerKeys()[provider];
    if (!apiKey) return fail(400, { error: `${PROVIDER_KEY_NAMES[provider]} is not set` });
    const result = await makeProvider(provider, apiKey).testModel(modelId);
    await settings().saveModelTest(provider, modelId, { ...result, testedAt: now() });
    return result.ok
      ? { tested: `${modelId} returned JSON and can draft` }
      : fail(502, { error: `${modelId} failed its test: ${redactText(result.reason ?? "")}` });
  },

  download: async ({ request }) => {
    const id = String((await request.formData()).get("source") ?? "") as SourceId;
    if (!Object.hasOwn(SOURCES, id) || !SOURCES[id].settings) {
      return fail(400, { error: "Choose the schedule, the injury report, or the depth chart." });
    }
    if (!sourceDownloadsEnabled()) {
      return fail(409, {
        error: "Downloads are off in verification mode, which reads checked-in fixtures.",
      });
    }
    const season = seasonOf(now());
    const result = await downloadSource(id, {
      season,
      output: sourcePath(id, season),
      fetch,
      now: () => new Date().toISOString(),
    });
    return result.ok ? { downloaded: SOURCE_TITLES[id] } : fail(502, { error: result.failure });
  },

  choose: async ({ request }) => {
    const value = String((await request.formData()).get("drafter") ?? "");
    const result = await chooseDrafter(settings(), value);
    return result.ok ? { chosen: value } : fail(400, { error: result.error });
  },
} satisfies Actions;
