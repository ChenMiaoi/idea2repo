import { createHash } from "node:crypto";

export type PdfStatus = "downloaded" | "not_available" | "failed" | "skipped_license";
export type PdfExtractionQualityStatus = "empty" | "weak" | "ok";

export type PdfPageExtractionQuality = {
  page: number;
  char_count: number;
  text_density: number;
  quality: PdfExtractionQualityStatus;
};

export type PdfExtractionQuality = {
  page_count: number;
  extracted_pages: number;
  mean_chars_per_page: number;
  weak_pages: number[];
  empty_pages: number[];
  quality: PdfExtractionQualityStatus;
  pages: PdfPageExtractionQuality[];
  warnings: string[];
};

export type PdfManifestRecord = {
  paper_id: string;
  pdf_path?: string;
  pdf_sha256?: string;
  source_url?: string;
  downloaded_at?: string;
  bytes?: number;
  license_hint: "arXiv" | "publisher" | "author-page" | "unknown";
  title_match_score?: number;
  extraction_quality?: PdfExtractionQuality;
  status: PdfStatus;
  reason?: string;
};

export function sha256(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function licenseHint(url: string): PdfManifestRecord["license_hint"] {
  const lowered = url.toLowerCase();
  if (lowered.includes("arxiv.org")) return "arXiv";
  if (lowered.includes("aclanthology.org") || lowered.includes("openreview.net")) return "publisher";
  if (lowered.includes("github.io") || lowered.includes("people.") || lowered.includes("~")) return "author-page";
  return "unknown";
}

export function titleMatchScore(title: string, text: string): number {
  const titleTerms = terms(title);
  const textTerms = new Set(terms(text).slice(0, 500));
  if (!titleTerms.length) return 0;
  const matches = titleTerms.filter((term) => textTerms.has(term)).length;
  return Math.round((matches / titleTerms.length) * 1000) / 1000;
}

function terms(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((term) => term.length > 2);
}
