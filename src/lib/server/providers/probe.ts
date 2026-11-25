import { ProviderError, type ThesisProvider } from "./contracts.ts";

export type ProviderKeyHealth =
  | { state: "ok" }
  | { state: "rejected"; detail: string }
  | { state: "unreachable"; detail: string };

/**
 * One cheap catalog request that classifies a configured key before an analysis spends a full
 * evidence run discovering the same failure. The provider's own catalog timeout bounds it.
 */
export async function probeProviderKey(
  provider: Pick<ThesisProvider, "discoverModels">,
): Promise<ProviderKeyHealth> {
  try {
    await provider.discoverModels();
    return { state: "ok" };
  } catch (error) {
    if (!(error instanceof ProviderError)) {
      return {
        state: "unreachable",
        detail: error instanceof Error ? error.message : "The request failed.",
      };
    }
    if (error.kind === "auth") return { state: "rejected", detail: error.message };
    return { state: "unreachable", detail: error.message };
  }
}
