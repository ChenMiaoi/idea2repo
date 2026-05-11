import { createHash } from "node:crypto";
import { signalWithTimeout, throwIfAborted } from "../../../runtime/abort.js";
import type { LiteratureAdapterOptions, LiteratureAdapterResult, LiteratureSource, PaperCandidate } from "../types.js";

export async function fetchJson<T>(url: string, options: LiteratureAdapterOptions): Promise<T> {
  throwIfAborted(options.signal);
  const response = await options.fetchImpl(url, { headers: { accept: "application/json" }, signal: signalWithTimeout(options.signal, 30_000) });
  throwIfAborted(options.signal);
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throwIfAborted(options.signal);
    throw new Error(`${response.status} ${text}`);
  }
  const json = (await response.json()) as T;
  throwIfAborted(options.signal);
  return json;
}

export async function fetchText(url: string, options: LiteratureAdapterOptions): Promise<string> {
  throwIfAborted(options.signal);
  const response = await options.fetchImpl(url, { headers: { accept: "application/xml,text/xml,text/html,text/plain" }, signal: signalWithTimeout(options.signal, 30_000) });
  throwIfAborted(options.signal);
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throwIfAborted(options.signal);
    throw new Error(`${response.status} ${text}`);
  }
  const text = await response.text();
  throwIfAborted(options.signal);
  return text;
}

export async function guardedAdapter(
  source: LiteratureSource,
  options: LiteratureAdapterOptions,
  run: () => Promise<PaperCandidate[]>
): Promise<LiteratureAdapterResult> {
  try {
    throwIfAborted(options.signal);
    const candidates = await run();
    throwIfAborted(options.signal);
    return { source, candidates, warnings: [] };
  } catch (error) {
    throwIfAborted(options.signal);
    return { source, candidates: [], warnings: [`${source} search failed for "${options.query}": ${error instanceof Error ? error.message : String(error)}`] };
  }
}

export function candidateId(source: LiteratureSource, stable: string): string {
  return `${source}-${createHash("sha1").update(stable).digest("hex").slice(0, 12)}`;
}

export function compact(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function firstUrl(...values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value && /^https?:\/\//.test(value)));
}
