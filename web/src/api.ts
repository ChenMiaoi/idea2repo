import type {
  ArtifactReadRequest,
  ArtifactReadResponse,
  GenerateRequest,
  GenerateResponse,
  GithubDryRunRequest,
  PathRequest,
  StatusResponse
} from "../../src/api-contract";
import type { RuntimeEvent, RuntimeRunSummary } from "./types";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type {
  ArtifactReadRequest,
  ArtifactReadResponse,
  GenerateRequest,
  GenerateResponse,
  GithubDryRunRequest,
  PathRequest,
  StatusResponse
};

export type RuntimeRunStartResponse = {
  run_id: string;
  status: RuntimeRunSummary["status"];
  output_root: string;
  events_url: string;
  plan_url: string;
  decisions_url: string;
  artifacts_url: string;
};

export type RuntimeRunListResponse = {
  runs: RuntimeRunSummary[];
};

export type EventSourceLike = {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
};

export type RuntimeEventSubscription = {
  close: () => void;
};

export function getApiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
}

export function buildApiUrl(path: string, base = getApiBase()): string {
  if (!base) {
    return path;
  }
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function postJson<T>(
  path: string,
  body: unknown,
  base = getApiBase()
): Promise<ApiResult<T>> {
  if (!base) {
    return { ok: false, error: "API base URL is not configured" };
  }
  try {
    const response = await fetch(buildApiUrl(path, base), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = (await response.json()) as T;
    if (!response.ok) {
      return {
        ok: false,
        error: (data as { detail?: string }).detail ?? response.statusText
      };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown request failure"
    };
  }
}

export async function getJson<T>(path: string, base = getApiBase()): Promise<ApiResult<T>> {
  if (!base) {
    return { ok: false, error: "API base URL is not configured" };
  }
  try {
    const response = await fetch(buildApiUrl(path, base));
    const data = (await response.json()) as T;
    if (!response.ok) {
      return {
        ok: false,
        error: (data as { detail?: string }).detail ?? response.statusText
      };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "unknown request failure"
    };
  }
}

export function subscribeRunEvents(
  runId: string,
  handlers: {
    onEvent: (event: RuntimeEvent) => void;
    onError?: (message: string) => void;
    onClose?: () => void;
  },
  base = getApiBase(),
  createSource: (url: string) => EventSourceLike = (url) => new EventSource(url)
): RuntimeEventSubscription {
  if (!base) {
    handlers.onError?.("API base URL is not configured");
    return { close: () => undefined };
  }
  const source = createSource(buildApiUrl(`/runs/${encodeURIComponent(runId)}/events`, base));
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    source.close();
    handlers.onClose?.();
  };
  for (const type of runtimeEventTypes) {
    source.addEventListener(type, (message) => {
      try {
        const event = JSON.parse(message.data) as RuntimeEvent;
        handlers.onEvent(event);
        if (isFinalRuntimeEvent(event)) close();
      } catch {
        handlers.onError?.(`Invalid runtime event payload for ${type}`);
      }
    });
  }
  source.onerror = () => {
    if (closed) return;
    handlers.onError?.("Runtime event stream disconnected");
    close();
  };
  return {
    close
  };
}

export const runtimeEventTypes = [
  "run.started",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "stage.started",
  "stage.completed",
  "stage.skipped",
  "stage.failed",
  "plan.updated",
  "decision.recorded",
  "artifact.written",
  "artifact.snapshot",
  "artifact.restored",
  "tool.started",
  "tool.completed",
  "approval.requested",
  "approval.resolved"
] as const;

function isFinalRuntimeEvent(event: RuntimeEvent): boolean {
  return event.type === "run.completed" || event.type === "run.failed" || event.type === "run.cancelled";
}
