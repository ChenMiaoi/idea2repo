import { createHash } from "node:crypto";
import type { LiteratureAdapterOptions, LiteratureAdapterResult, LiteratureSource, PaperCandidate } from "../types.js";

export async function fetchJson<T>(url: string, options: LiteratureAdapterOptions): Promise<T> {
  const response = await options.fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${await response.text().catch(() => response.statusText)}`);
  return (await response.json()) as T;
}

export async function fetchText(url: string, options: LiteratureAdapterOptions): Promise<string> {
  const response = await options.fetchImpl(url, { headers: { accept: "application/xml,text/xml,text/html,text/plain" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${await response.text().catch(() => response.statusText)}`);
  return response.text();
}

export async function guardedAdapter(
  source: LiteratureSource,
  options: LiteratureAdapterOptions,
  run: () => Promise<PaperCandidate[]>
): Promise<LiteratureAdapterResult> {
  try {
    return { source, candidates: await run(), warnings: [] };
  } catch (error) {
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
