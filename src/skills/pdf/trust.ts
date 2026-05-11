import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildPdfChunkIndex, type PdfChunkIndexEntry } from "./chunk.js";
import { licenseHint, sha256, type PdfManifestRecord } from "./provenance.js";
import { assertPdf } from "./validate.js";

export type TrustedPdfChunkResult = {
  chunks: PdfChunkIndexEntry[];
  storedChunksTrusted: boolean;
  warnings: string[];
};

export async function rebuildTrustedPdfChunks(root: string, manifest: PdfManifestRecord[], storedChunks: PdfChunkIndexEntry[] = []): Promise<TrustedPdfChunkResult> {
  const warnings: string[] = [];
  if (!(await validateDownloadedPdfManifest(root, manifest))) {
    if (storedChunks.length) warnings.push("Stored PDF chunks ignored because PDF manifest provenance could not be validated.");
    return { chunks: [], storedChunksTrusted: false, warnings };
  }
  const rebuiltChunks = await buildPdfChunkIndex(root, manifest);
  const storedChunksTrusted = storedChunks.length > 0 && pdfChunksEqual(storedChunks, rebuiltChunks);
  if (storedChunks.length && !storedChunksTrusted) warnings.push("Stored PDF chunks ignored because they do not match chunks rebuilt from validated PDF bytes.");
  return { chunks: rebuiltChunks, storedChunksTrusted, warnings };
}

export function pdfChunksEqual(left: PdfChunkIndexEntry[], right: PdfChunkIndexEntry[]): boolean {
  if (left.length !== right.length) return false;
  const normalize = (chunk: PdfChunkIndexEntry) => JSON.stringify({
    paper_id: chunk.paper_id,
    chunk_id: chunk.chunk_id,
    page: chunk.page,
    text: chunk.text
  });
  const leftRows = left.map(normalize).sort();
  const rightRows = right.map(normalize).sort();
  return leftRows.every((row, index) => row === rightRows[index]);
}

export async function validateDownloadedPdfManifest(root: string, manifest: PdfManifestRecord[]): Promise<boolean> {
  for (const record of manifest) {
    if (record.status !== "downloaded") continue;
    if (
      !record.pdf_path ||
      !record.pdf_sha256 ||
      !record.source_url ||
      !record.downloaded_at ||
      !record.license_hint ||
      typeof record.bytes !== "number" ||
      typeof record.title_match_score !== "number" ||
      record.title_match_score < 0.2 ||
      record.license_hint === "unknown" ||
      licenseHint(record.source_url) !== record.license_hint
    ) {
      return false;
    }
    let buffer: Buffer;
    try {
      buffer = await readFile(join(root, record.pdf_path));
    } catch {
      return false;
    }
    if (buffer.byteLength !== record.bytes) return false;
    if (sha256(buffer) !== record.pdf_sha256) return false;
    try {
      assertPdf(buffer);
    } catch {
      return false;
    }
  }
  return true;
}
