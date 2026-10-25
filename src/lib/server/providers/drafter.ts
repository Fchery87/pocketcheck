import { createFixtureDrafter } from "../analysis/fixture-drafter.ts";
import type { SettingsStore } from "../settings/store.ts";
import {
  applyModelTests,
  type ProviderId,
  type ThesisDrafter,
  type ThesisProvider,
} from "./contracts.ts";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  theclawbay: "TheClawBay",
  deepseek: "DeepSeek",
};

export const PROVIDER_KEY_NAMES: Record<ProviderId, string> = {
  theclawbay: "THECLAWBAY_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

/**
 * The drafter Settings chose. A provider that cannot be used is an error, never a quiet switch to
 * another provider or to the fixture.
 */
export async function resolveDrafter(input: {
  settings: SettingsStore;
  keys: Partial<Record<ProviderId, string>>;
  makeProvider: (id: ProviderId, apiKey: string) => ThesisProvider;
}): Promise<{ ok: true; drafter: ThesisDrafter } | { ok: false; error: string }> {
  const choice = await input.settings.getDrafter();
  if (choice.provider === "fixture") return { ok: true, drafter: createFixtureDrafter() };

  const label = PROVIDER_LABELS[choice.provider];
  const apiKey = input.keys[choice.provider];
  if (!apiKey) {
    return {
      ok: false,
      error: `${label} is selected in Settings but ${PROVIDER_KEY_NAMES[choice.provider]} is not set.`,
    };
  }
  const catalog = await input.settings.getCatalog(choice.provider);
  if (!catalog) {
    return { ok: false, error: `Refresh the ${label} catalog in Settings before drafting.` };
  }
  const entries = applyModelTests(
    catalog.entries,
    await input.settings.getModelTests(choice.provider),
  );
  const provider = input.makeProvider(choice.provider, apiKey);
  return {
    ok: true,
    drafter: {
      id: choice.provider,
      modelId: choice.modelId,
      // The provider refuses a model that was removed or has not passed a test.
      draftThesis: (draft) => provider.draftThesis({ ...draft, catalog: entries }),
    },
  };
}
