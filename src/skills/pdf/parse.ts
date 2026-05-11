import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { throwIfAborted } from "../../runtime/abort.js";
import { assertPdf } from "./validate.js";

export type ParsedPdfPage = {
  page: number;
  text: string;
};

export type ParsedPdf = {
  path: string;
  page_count: number;
  title_candidate: string;
  pages: ParsedPdfPage[];
  warnings: string[];
};

export type ParsePdfOptions = {
  signal?: AbortSignal;
};

export async function parsePdf(path: string, options: ParsePdfOptions = {}): Promise<ParsedPdf> {
  throwIfAborted(options.signal);
  const buffer = await readFile(path);
  throwIfAborted(options.signal);
  return parsePdfBuffer(buffer, path, options);
}

export async function parsePdfBuffer(buffer: Buffer | Uint8Array, path = "<buffer>", options: ParsePdfOptions = {}): Promise<ParsedPdf> {
  throwIfAborted(options.signal);
  assertPdf(buffer);
  const pdfjsParsed = await parseWithPdfjs(buffer, path, options);
  throwIfAborted(options.signal);
  if (pdfjsParsed) return pdfjsParsed;
  const raw = buffer.toString("latin1");
  const pages = extractPages(raw, options.signal);
  throwIfAborted(options.signal);
  const text = pages.map((page) => page.text).join("\n");
  return {
    path,
    page_count: pages.length || 1,
    title_candidate: titleCandidate(text),
    pages: pages.length ? pages : [{ page: 1, text: cleanup(raw).slice(0, 20_000) }],
    warnings: ["Static PDF text extraction is best-effort; use a structured parser for final evidence."]
  };
}

async function parseWithPdfjs(buffer: Buffer | Uint8Array, path: string, options: ParsePdfOptions): Promise<ParsedPdf | null> {
  try {
    throwIfAborted(options.signal);
    const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
    throwIfAborted(options.signal);
    const pages: ParsedPdfPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      throwIfAborted(options.signal);
      const page = await document.getPage(pageNumber);
      throwIfAborted(options.signal);
      const content = await page.getTextContent();
      throwIfAborted(options.signal);
      const text = content.items.map((item: unknown) => (typeof item === "object" && item && "str" in item ? String((item as { str: unknown }).str) : "")).join(" ");
      pages.push({ page: pageNumber, text: cleanup(text) });
    }
    const joined = pages.map((page) => page.text).join("\n");
    return {
      path,
      page_count: document.numPages,
      title_candidate: titleCandidate(joined),
      pages,
      warnings: []
    };
  } catch {
    throwIfAborted(options.signal);
    return null;
  }
}

function extractPages(raw: string, signal?: AbortSignal): ParsedPdfPage[] {
  const chunks = raw.split(/\/Type\s*\/Page\b/g).slice(1);
  const pages: ParsedPdfPage[] = [];
  for (const [index, chunk] of chunks.entries()) {
    throwIfAborted(signal);
    const page = { page: index + 1, text: cleanup(chunk).slice(0, 20_000) };
    if (page.text) pages.push(page);
  }
  return pages;
}

function cleanup(value: string): string {
  return value.replace(/[^\x09\x0a\x0d\x20-\x7e]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleCandidate(text: string): string {
  return text.split(/[.!?\n]/).map((part) => part.trim()).find((part) => part.length >= 10 && part.length <= 160) ?? "";
}
