import type {
  ArtifactReadRequest,
  ArtifactReadResponse,
  GenerateRequest,
  GenerateResponse,
  GithubDryRunRequest,
  PathRequest,
  StatusResponse
} from "../../src/api-contract";

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
