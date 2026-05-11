import { CODEX_CLI_PROVIDER_ID, OFFLINE_PROVIDER_ID, OPENAI_CODEX_PROVIDER_ID } from "../providers.js";
import { OpenAICodexOAuthAdapter } from "./codex-oauth.js";
import { OfflineAdapter } from "./offline.js";
import type { ProviderAdapter } from "./adapter.js";

export function createProviderAdapter(id: string): ProviderAdapter {
  if (id === OFFLINE_PROVIDER_ID) return new OfflineAdapter();
  if (id === OPENAI_CODEX_PROVIDER_ID) return new OpenAICodexOAuthAdapter();
  if (id === CODEX_CLI_PROVIDER_ID) throw new Error("Codex CLI provider adapter is implemented in the Codex CLI runtime phase.");
  throw new Error(`unsupported provider adapter: ${id}`);
}

export { OpenAICodexOAuthAdapter } from "./codex-oauth.js";
export { OfflineAdapter, offlineResearchAnalysis } from "./offline.js";
export type { ProviderAdapter, StructuredRequest, ProviderAdapterStatus } from "./adapter.js";
