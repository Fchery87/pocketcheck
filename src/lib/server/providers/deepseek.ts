import { createChatProvider } from "./chat.ts";
import type { ProviderOptions, ThesisProvider } from "./contracts.ts";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export function createDeepSeekProvider(options: ProviderOptions): ThesisProvider {
  return createChatProvider({ id: "deepseek", baseUrl: DEEPSEEK_BASE_URL, options });
}
