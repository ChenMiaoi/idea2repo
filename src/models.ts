import { execFileSync } from "node:child_process";
import { OPENAI_CODEX_PROVIDER_ID } from "./providers.js";
import { proxyEnvForChild } from "./proxy.js";

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type CodexModel = {
  id: string;
  label: string;
  provider: typeof OPENAI_CODEX_PROVIDER_ID;
  default_reasoning: ReasoningEffort;
  supported_reasoning: ReasoningEffort[];
};

export type CodexModelCatalog = {
  source: "builtin" | "codex-debug-models";
  available: boolean;
  default_model: string;
  models: CodexModel[];
  unsupported_blocklist: string[];
};

export const unsupportedChatGptModelBlocklist = [
  "gpt-5.1-codex-mini",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex",
  "gpt-5.1"
] as const;

const builtinModels: CodexModel[] = [
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: OPENAI_CODEX_PROVIDER_ID,
    default_reasoning: "medium",
    supported_reasoning: ["low", "medium", "high", "xhigh"]
  },
  {
    id: "gpt-5.4",
    label: "gpt-5.4",
    provider: OPENAI_CODEX_PROVIDER_ID,
    default_reasoning: "medium",
    supported_reasoning: ["low", "medium", "high", "xhigh"]
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4-Mini",
    provider: OPENAI_CODEX_PROVIDER_ID,
    default_reasoning: "medium",
    supported_reasoning: ["low", "medium", "high", "xhigh"]
  },
  model("gpt-5.3-codex", "gpt-5.3-codex", "medium"),
  model("gpt-5.2", "gpt-5.2", "medium"),
  model("gpt-5.3-codex-spark", "GPT-5.3-Codex-Spark", "high")
];

export function loadCodexModelCatalog(options: { cwd?: string; runner?: (command: string, args: string[], cwd: string) => string } = {}): CodexModelCatalog {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? defaultRunner;
  try {
    const output = runner("codex", ["debug", "models"], cwd);
    const parsed = JSON.parse(output) as unknown;
    const models = normalizeDebugModels(parsed);
    const filtered = filterUnsupportedModels(models);
    if (filtered.length) {
      return {
        source: "codex-debug-models",
        available: true,
        default_model: filtered[0]!.id,
        models: filtered,
        unsupported_blocklist: [...unsupportedChatGptModelBlocklist]
      };
    }
  } catch {
    // Local Codex CLI model discovery is optional; builtin catalog is the fallback.
  }
  return {
    source: "builtin",
    available: false,
    default_model: builtinModels[0]!.id,
    models: builtinModels,
    unsupported_blocklist: [...unsupportedChatGptModelBlocklist]
  };
}

export function filterUnsupportedModels<T extends { provider?: string; id?: string }>(models: T[]): T[] {
  const unsupported = new Set<string>(unsupportedChatGptModelBlocklist);
  return models.filter((model) => model.provider !== OPENAI_CODEX_PROVIDER_ID || !unsupported.has(model.id ?? ""));
}

function normalizeDebugModels(value: unknown): CodexModel[] {
  const candidates = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { models?: unknown }).models)
      ? (value as { models: unknown[] }).models
      : [];
  return candidates
    .map((item): CodexModel | null => {
      if (!item || typeof item !== "object") return null;
      const raw = item as {
        id?: unknown;
        slug?: unknown;
        name?: unknown;
        label?: unknown;
        display_name?: unknown;
        provider?: unknown;
        default_reasoning?: unknown;
        default_reasoning_level?: unknown;
        supported_reasoning?: unknown;
        supported_reasoning_levels?: unknown;
        visibility?: unknown;
      };
      if (raw.visibility === "hide") return null;
      const id = typeof raw.id === "string" ? raw.id : typeof raw.slug === "string" ? raw.slug : typeof raw.name === "string" ? raw.name : "";
      if (!id) return null;
      const rawSupported = Array.isArray(raw.supported_reasoning)
        ? raw.supported_reasoning
        : Array.isArray(raw.supported_reasoning_levels)
          ? raw.supported_reasoning_levels.map((level) => (level && typeof level === "object" ? (level as { effort?: unknown }).effort : level))
          : [];
      const supported: ReasoningEffort[] = rawSupported.filter(isReasoningEffort);
      const defaultReasoning = isReasoningEffort(raw.default_reasoning)
        ? raw.default_reasoning
        : isReasoningEffort(raw.default_reasoning_level)
          ? raw.default_reasoning_level
          : "medium";
      return {
        id,
        label: typeof raw.label === "string" ? raw.label : typeof raw.display_name === "string" ? raw.display_name : id,
        provider: OPENAI_CODEX_PROVIDER_ID,
        default_reasoning: defaultReasoning,
        supported_reasoning: supported.length ? supported : ["low", "medium", "high", "xhigh"]
      };
    })
    .filter((model): model is CodexModel => model !== null);
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh";
}

function defaultRunner(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: proxyEnvForChild() });
}

function model(id: string, label: string, defaultReasoning: ReasoningEffort): CodexModel {
  return {
    id,
    label,
    provider: OPENAI_CODEX_PROVIDER_ID,
    default_reasoning: defaultReasoning,
    supported_reasoning: ["low", "medium", "high", "xhigh"]
  };
}
