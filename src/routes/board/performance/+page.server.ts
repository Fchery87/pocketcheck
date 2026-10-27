import { error } from "@sveltejs/kit";
import { ConfigError, researchStore } from "#lib/server/config.ts";
import { modelPickPerformance } from "#lib/server/analysis/model-pick-performance.ts";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
  let journal;
  try {
    journal = researchStore();
  } catch (cause) {
    if (cause instanceof ConfigError) error(503, cause.message);
    throw cause;
  }
  const [picks, closings] = await Promise.all([journal.listModelPicks(), journal.listClosings()]);
  return { performance: modelPickPerformance(picks, closings) };
};
