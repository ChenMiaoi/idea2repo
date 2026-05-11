import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
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

export async function parsePdf(path: string): Promise<ParsedPdf> {
  const buffer = await readFile(path);
  return parsePdfBuffer(buffer, path);
}

export async function parsePdfBuffer(buffer: Buffer | Uint8Array, path = "<buffer>"): Promise<ParsedPdf> {
  assertPdf(buffer);
  const pdfjsParsed = await parseWithPdfjs(buffer, path);
  if (pdfjsParsed) return pdfjsParsed;
  const raw = buffer.toString("latin1");
  const pages = extractPages(raw);
  const text = pages.map((page) => page.text).join("\n");
  return {
    path,
    page_count: pages.length || 1,
    title_candidate: titleCandidate(text),
    pages: pages.length ? pages : [{ page: 1, text: cleanup(raw).slice(0, 20_000) }],
    warnings: ["Static PDF text extraction is best-effort; use a structured parser for final evidence."]
  };
}

async function parseWithPdfjs(buffer: Buffer | Uint8Array, path: string): Promise<ParsedPdf | null> {
  try {
    const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages: ParsedPdfPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
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
    return null;
  }
}

function extractPages(raw: string): ParsedPdfPage[] {
  const chunks = raw.split(/\/Type\s*\/Page\b/g).slice(1);
  return chunks.map((chunk, index) => ({ page: index + 1, text: cleanup(chunk).slice(0, 20_000) })).filter((page) => page.text);
}

function cleanup(value: string): string {
  return value.replace(/[^\x09\x0a\x0d\x20-\x7e]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleCandidate(text: string): string {
  return text.split(/[.!?\n]/).map((part) => part.trim()).find((part) => part.length >= 10 && part.length <= 160) ?? "";
}
