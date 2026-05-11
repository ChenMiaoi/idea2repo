import { join } from "node:path";
import { throwIfAborted } from "../../runtime/abort.js";
import type { PdfManifestRecord } from "./provenance.js";
import { assessPdfExtractionQuality, extractionQualityForPage } from "./quality.js";
import { parsePdf } from "./parse.js";
import type { ParsedPdf } from "./parse.js";

export type PdfChunk = {
  chunk_id: string;
  page: number;
  text: string;
  char_count?: number;
  text_density?: number;
  extraction_quality?: "empty" | "weak" | "ok";
};

export type PdfChunkOptions = {
  signal?: AbortSignal;
};

export function chunkPdf(parsed: ParsedPdf, maxChars = 2200, signal?: AbortSignal): PdfChunk[] {
  const chunks: PdfChunk[] = [];
  const extractionQuality = assessPdfExtractionQuality(parsed);
  for (const page of parsed.pages) {
    throwIfAborted(signal);
    const text = page.text.trim();
    if (!text) continue;
    const pageQuality = extractionQualityForPage(extractionQuality, page.page);
    for (let offset = 0; offset < text.length; offset += maxChars) {
      throwIfAborted(signal);
      chunks.push({
        chunk_id: `p${page.page}-c${Math.floor(offset / maxChars) + 1}`,
        page: page.page,
        text: text.slice(offset, offset + maxChars),
        char_count: pageQuality?.char_count,
        text_density: pageQuality?.text_density,
        extraction_quality: pageQuality?.quality
      });
    }
  }
  return chunks;
}

export type PdfChunkIndexEntry = PdfChunk & {
  paper_id: string;
};

export async function buildPdfChunkIndex(root: string, manifest: PdfManifestRecord[], options: PdfChunkOptions = {}): Promise<PdfChunkIndexEntry[]> {
  const entries: PdfChunkIndexEntry[] = [];
  for (const record of manifest) {
    throwIfAborted(options.signal);
    if (record.status !== "downloaded" || !record.pdf_path) continue;
    try {
      const parsed = await parsePdf(join(root, record.pdf_path), options);
      entries.push(...chunkPdf(parsed, undefined, options.signal).map((chunk) => ({ ...chunk, paper_id: record.paper_id })));
    } catch {
      throwIfAborted(options.signal);
      continue;
    }
  }
  return entries;
}
