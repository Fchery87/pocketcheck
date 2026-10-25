import { createChatProvider } from "./chat.ts";
import type { ProviderOptions, ThesisProvider } from "./contracts.ts";

export const THECLAWBAY_BASE_URL = "https://api.theclawbay.com/v1";

export function createTheClawBayProvider(options: ProviderOptions): ThesisProvider {
  return createChatProvider({ id: "theclawbay", baseUrl: THECLAWBAY_BASE_URL, options });
}
