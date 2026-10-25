import { applyModelTests, type ProviderId } from "../providers/contracts.ts";
import { PROVIDER_LABELS } from "../providers/drafter.ts";
import type { SettingsStore } from "./store.ts";

const isProvider = (value: string): value is ProviderId => value in PROVIDER_LABELS;

/**
 * Save the drafter choice from Settings: "fixture" or "<provider>:<model>". Only a model the
 * catalog declares as text, or that passed a test, can be chosen.
 */
export async function chooseDrafter(
  settings: SettingsStore,
  value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (value === "fixture") {
    await settings.setDrafter({ provider: "fixture" });
    return { ok: true };
  }
  const separator = value.indexOf(":");
  const provider = value.slice(0, separator);
  const modelId = value.slice(separator + 1);
  if (separator === -1 || !isProvider(provider)) {
    return { ok: false, error: `Unknown drafter ${value}` };
  }
  const label = PROVIDER_LABELS[provider];
  const catalog = await settings.getCatalog(provider);
  const tests = await settings.getModelTests(provider);
  const entries = applyModelTests(catalog?.entries ?? [], tests);
  const entry = entries.find((item) => item.id === modelId);
  if (!entry) return { ok: false, error: `${modelId} is not in the ${label} catalog` };
  if (!entry.compatible) {
    return {
      ok: false,
      error:
        entry.capability === "untested" && !tests[modelId]
          ? `Test ${modelId} before choosing it`
          : `${modelId} cannot draft: ${entry.reason}`,
    };
  }
  await settings.setDrafter({ provider, modelId });
  return { ok: true };
}
