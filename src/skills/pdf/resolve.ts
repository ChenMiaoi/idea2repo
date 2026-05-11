import { throwIfAborted } from "../../runtime/abort.js";
import type { PaperCandidate } from "../literature/types.js";

export type PdfUrlResolutionSource =
  | "candidate_pdf"
  | "candidate_source"
  | "arxiv"
  | "openalex_oa"
  | "openreview"
  | "acl_anthology";

export type ResolvedPdfUrl = {
  url: string;
  source: PdfUrlResolutionSource;
  reason: string;
};

export type PdfResolveOptions = {
  allowNetwork?: boolean;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

export function resolvePublicPdfUrls(candidate: PaperCandidate): ResolvedPdfUrl[] {
  const resolved: ResolvedPdfUrl[] = [];
  for (const url of candidate.pdf_urls) {
    const normalized = normalizeCandidatePdfUrl(url);
    if (normalized) addResolved(resolved, normalized, "candidate_pdf", "candidate supplied or linked a PDF URL");
  }
  for (const url of candidate.source_urls) {
    const derived = derivePdfUrlFromKnownSource(url);
    if (derived) addResolved(resolved, derived.url, derived.source, derived.reason);
  }
  if (candidate.arxiv_id) addResolved(resolved, arxivPdfUrl(candidate.arxiv_id), "arxiv", "candidate has an arXiv identifier");
  return dedupeResolved(resolved);
}

export async function resolvePublicPdfUrlsAsync(candidate: PaperCandidate, options: PdfResolveOptions = {}): Promise<ResolvedPdfUrl[]> {
  const deterministic = resolvePublicPdfUrls(candidate);
  if (!options.allowNetwork) return deterministic;
  const lookupUrl = openAlexLookupUrl(candidate);
  if (!lookupUrl) return deterministic;
  try {
    throwIfAborted(options.signal);
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(lookupUrl, { headers: { accept: "application/json" }, signal: options.signal });
    throwIfAborted(options.signal);
    if (!response.ok) return deterministic;
    const json = await response.json().catch(() => null);
    const openAlexUrls: ResolvedPdfUrl[] = openAlexPdfUrls(json).map((url) => ({
      url,
      source: "openalex_oa",
      reason: "OpenAlex reports an open-access PDF URL"
    }));
    return dedupeResolved([...deterministic, ...openAlexUrls]);
  } catch {
    throwIfAborted(options.signal);
    return deterministic;
  }
}

function derivePdfUrlFromKnownSource(sourceUrl: string): ResolvedPdfUrl | null {
  const normalized = normalizePdfUrl(sourceUrl);
  if (normalized) return { url: normalized, source: "candidate_source", reason: "candidate source URL points directly to a PDF" };
  const arxiv = arxivIdFromUrl(sourceUrl);
  if (arxiv) return { url: arxivPdfUrl(arxiv), source: "arxiv", reason: "candidate source URL is an arXiv abstract page" };
  const openReview = openReviewPdfUrl(sourceUrl);
  if (openReview) return { url: openReview, source: "openreview", reason: "candidate source URL is an OpenReview forum or attachment page" };
  const acl = aclAnthologyPdfUrl(sourceUrl);
  if (acl) return { url: acl, source: "acl_anthology", reason: "candidate source URL is an ACL Anthology paper page" };
  return null;
}

function normalizePdfUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const acl = aclAnthologyPdfUrl(trimmed);
  if (acl) return acl;
  const arxiv = arxivIdFromUrl(trimmed);
  if (arxiv && /\/pdf\//i.test(trimmed)) return arxivPdfUrl(arxiv);
  const openReview = openReviewPdfUrl(trimmed);
  if (openReview && /\/pdf\b/i.test(trimmed)) return openReview;
  if (/\.pdf(?:[?#].*)?$/i.test(trimmed)) return trimmed;
  return null;
}

function normalizeCandidatePdfUrl(value: string): string | null {
  const normalized = normalizePdfUrl(value);
  if (normalized) return normalized;
  const derived = derivePdfUrlFromKnownSource(value);
  return derived?.url ?? null;
}

function arxivPdfUrl(id: string): string {
  return `https://arxiv.org/pdf/${cleanArxivId(id)}`;
}

function arxivIdFromUrl(value: string): string | null {
  const match = value.match(/arxiv\.org\/(?:abs|pdf)\/([^?#/]+)(?:\.pdf)?/i);
  return match?.[1] ? cleanArxivId(match[1]) : null;
}

function cleanArxivId(value: string): string {
  return value.trim().replace(/^arxiv:/i, "").replace(/\.pdf$/i, "");
}

function openReviewPdfUrl(value: string): string | null {
  if (!/openreview\.net/i.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const id = url.searchParams.get("id");
  if (!id) return null;
  return `https://openreview.net/pdf?id=${encodeURIComponent(id)}`;
}

function aclAnthologyPdfUrl(value: string): string | null {
  if (!/aclanthology\.org/i.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const key = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\/\.pdf$/i, "").replace(/\.pdf$/i, "");
  if (!key || key.includes("/")) return null;
  return `https://aclanthology.org/${key}.pdf`;
}

function openAlexLookupUrl(candidate: PaperCandidate): string | null {
  if (candidate.openalex_id) {
    const id = candidate.openalex_id.match(/W\d+$/i)?.[0] ?? candidate.openalex_id.trim();
    if (id) return `https://api.openalex.org/works/${encodeURIComponent(id)}`;
  }
  if (candidate.doi) return `https://api.openalex.org/works/doi:${encodeURIComponent(candidate.doi.replace(/^https?:\/\/doi\.org\//i, ""))}`;
  return null;
}

function openAlexPdfUrls(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const work = value as Record<string, unknown>;
  const urls = [
    pdfUrlFromOpenAlexLocation(work.primary_location),
    pdfUrlFromOpenAlexLocation(work.best_oa_location),
    normalizeKnownPublicUrl(stringField(work.open_access, "oa_url"))
  ];
  const locations = Array.isArray(work.locations) ? work.locations : [];
  for (const location of locations) urls.push(pdfUrlFromOpenAlexLocation(location));
  return urls.filter((url): url is string => Boolean(url));
}

function pdfUrlFromOpenAlexLocation(value: unknown): string | undefined {
  return normalizeKnownPublicUrl(stringField(value, "pdf_url")) ?? normalizeKnownPublicUrl(stringField(value, "landing_page_url"));
}

function normalizeKnownPublicUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = normalizePdfUrl(value);
  if (normalized) return normalized;
  const derived = derivePdfUrlFromKnownSource(value);
  return derived?.url;
}

function stringField(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = (value as Record<string, unknown>)[field];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function addResolved(resolved: ResolvedPdfUrl[], url: string, source: PdfUrlResolutionSource, reason: string): void {
  if (url) resolved.push({ url, source, reason });
}

function dedupeResolved(items: ResolvedPdfUrl[]): ResolvedPdfUrl[] {
  const seen = new Set<string>();
  const deduped: ResolvedPdfUrl[] = [];
  for (const item of items) {
    const key = item.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}
