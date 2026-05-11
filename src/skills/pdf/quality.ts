import type { ParsedPdf } from "./parse.js";
import type { PdfExtractionQuality, PdfExtractionQualityStatus, PdfPageExtractionQuality } from "./provenance.js";

const EMPTY_PAGE_CHAR_THRESHOLD = 20;
const WEAK_PAGE_CHAR_THRESHOLD = 200;

export function assessPdfExtractionQuality(parsed: ParsedPdf): PdfExtractionQuality {
  const pages = parsed.pages.length ? parsed.pages : [{ page: 1, text: "" }];
  const pageQualities: PdfPageExtractionQuality[] = pages.map((page) => {
    const charCount = page.text.trim().length;
    const quality = pageQuality(charCount);
    return {
      page: page.page,
      char_count: charCount,
      text_density: charCount,
      quality
    };
  });
  const totalChars = pageQualities.reduce((sum, page) => sum + page.char_count, 0);
  const emptyPages = pageQualities.filter((page) => page.quality === "empty").map((page) => page.page);
  const weakPages = pageQualities.filter((page) => page.quality !== "ok").map((page) => page.page);
  const extractedPages = pageQualities.filter((page) => page.char_count > 0).length;
  const pageCount = parsed.page_count || pageQualities.length;
  const meanCharsPerPage = Math.round((totalChars / Math.max(1, pageCount)) * 1000) / 1000;
  const quality = documentQuality({ pageCount, meanCharsPerPage, emptyPages, weakPages });
  return {
    page_count: pageCount,
    extracted_pages: extractedPages,
    mean_chars_per_page: meanCharsPerPage,
    weak_pages: weakPages,
    empty_pages: emptyPages,
    quality,
    pages: pageQualities,
    warnings: qualityWarnings(quality, pageQualities, parsed.warnings)
  };
}

export function extractionQualityForPage(quality: PdfExtractionQuality | undefined, page: number): PdfPageExtractionQuality | undefined {
  return quality?.pages.find((item) => item.page === page);
}

function pageQuality(charCount: number): PdfExtractionQualityStatus {
  if (charCount < EMPTY_PAGE_CHAR_THRESHOLD) return "empty";
  if (charCount < WEAK_PAGE_CHAR_THRESHOLD) return "weak";
  return "ok";
}

function documentQuality(input: {
  pageCount: number;
  meanCharsPerPage: number;
  emptyPages: number[];
  weakPages: number[];
}): PdfExtractionQualityStatus {
  if (input.emptyPages.length >= input.pageCount) return "empty";
  if (input.meanCharsPerPage < WEAK_PAGE_CHAR_THRESHOLD || input.weakPages.length > 0) return "weak";
  return "ok";
}

function qualityWarnings(quality: PdfExtractionQualityStatus, pages: PdfPageExtractionQuality[], parserWarnings: string[]): string[] {
  const warnings = [...parserWarnings];
  if (quality === "empty") warnings.push("PDF text extraction produced no usable page text.");
  if (quality === "weak") {
    const weakPages = pages.filter((page) => page.quality !== "ok").map((page) => page.page);
    warnings.push(`Weak PDF text extraction detected on page(s): ${weakPages.join(", ")}.`);
  }
  return [...new Set(warnings)];
}
