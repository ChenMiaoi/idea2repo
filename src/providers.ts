export const OFFLINE_PROVIDER_ID = "offline";
export const OPENAI_CODEX_PROVIDER_ID = "openai-codex";
export const LEGACY_OAUTH_PROVIDER_ID = "openai-codex-oauth";
export const CODEX_CLI_PROVIDER_ID = "openai-codex-cli";

export type ProviderMode =
  | typeof OPENAI_CODEX_PROVIDER_ID
  | typeof LEGACY_OAUTH_PROVIDER_ID
  | typeof CODEX_CLI_PROVIDER_ID
  | typeof OFFLINE_PROVIDER_ID
  | "openai_api_key"
  | "enterprise_gateway"
  | "local_model";

export function canonicalProvider(provider?: string | null, offline = false): ProviderMode {
  if (offline) return OFFLINE_PROVIDER_ID;
  if (!provider) return OPENAI_CODEX_PROVIDER_ID;
  if (provider === LEGACY_OAUTH_PROVIDER_ID) return OPENAI_CODEX_PROVIDER_ID;
  if (
    provider === OPENAI_CODEX_PROVIDER_ID ||
    provider === CODEX_CLI_PROVIDER_ID ||
    provider === OFFLINE_PROVIDER_ID ||
    provider === "openai_api_key" ||
    provider === "enterprise_gateway" ||
    provider === "local_model"
  ) {
    return provider;
  }
  throw new Error(`unsupported provider: ${provider}`);
}

export function apiShapeForProvider(provider: string): string {
  if (provider === OPENAI_CODEX_PROVIDER_ID || provider === LEGACY_OAUTH_PROVIDER_ID) return "openai-codex-responses";
  if (provider === CODEX_CLI_PROVIDER_ID) return "codex-exec-json";
  if (provider === OFFLINE_PROVIDER_ID) return "deterministic-fallback";
  return provider;
}

export function providerSchema(): object {
  return {
    version: 1,
    default: OPENAI_CODEX_PROVIDER_ID,
    modes: {
      [OPENAI_CODEX_PROVIDER_ID]: {
        auth_boundary:
          "Use Idea2Repo-managed OpenAI Codex OAuth credentials stored under ~/.idea2repo; never read ~/.codex auth files or browser cookies.",
        required_environment: []
      },
      [CODEX_CLI_PROVIDER_ID]: {
        auth_boundary: "Use the official Codex CLI as an explicit provider.",
        required_environment: []
      },
      [OFFLINE_PROVIDER_ID]: {
        auth_boundary: "Offline mode writes deterministic placeholders and performs no model calls.",
        required_environment: []
      }
    },
    secret_policy: {
      never_write: ["tokens", "cookies", "API keys", "private provider responses", "browser profile state"],
      redacted_environment: ["OPENAI_API_KEY", "OPENAI_BASE_URL", "ENTERPRISE_GATEWAY_URL", "LOCAL_MODEL_ENDPOINT"],
      user_state_directory: "~/.idea2repo/agent/codex",
      auth_file: "~/.idea2repo/agent/codex/auth.json",
      secret_storage: "file_credentials"
    }
  };
}

export function safeProviderReport(provider = OPENAI_CODEX_PROVIDER_ID): string {
  const schema = providerSchema() as { secret_policy: Record<string, unknown> };
  return `# Provider Configuration

## Active Mode

- Mode: ${provider}
- Boundary: ${provider === OFFLINE_PROVIDER_ID ? "Offline deterministic fallback." : "Idea2Repo-managed provider credentials; never read ~/.codex or browser cookies."}
- Auth file: ${schema.secret_policy.auth_file}

## Credential Rules

- Do not store tokens, cookies, API keys, or private provider responses in this repository.
- Store Idea2Repo auth metadata under ~/.idea2repo/agent/codex.
- Never read ~/.codex auth files or scrape browser cookies.
`;
}

export function providerSchemaJson(): string {
  return JSON.stringify(providerSchema(), null, 2) + "\n";
}

export function containsSecretMaterial(text: string): boolean {
  const lowered = text.toLowerCase();
  const markers = [
    "sk-",
    "ghp_",
    "gho_",
    "ghu_",
    "ghs_",
    "ghr_",
    "github_pat_",
    "session_token",
    "refresh_token",
    "access_token=",
    "github_token=",
    "aws_secret_access_key=",
    "cookie:",
    "set-cookie:",
    "authorization: bearer",
    "-----begin openssh private key-----",
    "-----begin rsa private key-----",
    "-----begin private key-----"
  ];
  if (markers.some((marker) => lowered.includes(marker))) return true;
  const patterns = [
    /\b[a-z0-9_-]*(?:api[_-]?key|token|secret|password)[ \t]*[=:][ \t]*(?!set\b|unset\b|<redacted\b)['"]?[^'"\s#,\]}]+/i,
    /['"][a-z0-9_-]*(?:api[_-]?key|token|secret|password)['"][ \t]*:[ \t]*['"](?!set['"]|unset['"]|<redacted)[^'"]+['"]/i,
    /\b[a-z0-9_-]*(?:database|db)[a-z0-9_-]*(?:url|uri)[ \t]*[=:][ \t]*['"]?[a-z][a-z0-9+.-]*:\/\/[^'"\s]+:[^'"\s]+@/i,
    /\bmachine\s+\S+\s+login\s+\S+\s+password\s+\S+/i
  ];
  return patterns.some((pattern) => pattern.test(text));
}
