import type { LiteratureAdapterOptions } from "../types.js";
import { asArray, candidateId, compact, fetchJson, firstUrl, guardedAdapter, numberValue, stringValue } from "./common.js";

export async function searchOpenAlex(options: LiteratureAdapterOptions) {
  return guardedAdapter("openalex", options, async () => {
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("search", options.query);
    url.searchParams.set("per-page", String(options.limit));
    const json = await fetchJson<{ results?: unknown[] }>(url.toString(), options);
    return asArray(json.results).map((item) => {
      const work = item as Record<string, unknown>;
      const title = compact(stringValue(work.title) ?? stringValue(work.display_name) ?? "Untitled OpenAlex work");
      const doi = stringValue(work.doi)?.replace(/^https:\/\/doi\.org\//, "");
      const primary = work.primary_location as Record<string, unknown> | undefined;
      const source = primary?.source as Record<string, unknown> | undefined;
      const openAccess = work.open_access as Record<string, unknown> | undefined;
      const urls = firstUrl(stringValue(work.id), doi ? `https://doi.org/${doi}` : undefined, stringValue(primary?.landing_page_url));
      const pdfUrls = firstUrl(stringValue(primary?.pdf_url), stringValue(openAccess?.oa_url));
      const authors = asArray(work.authorships).map((entry) => stringValue((entry as Record<string, unknown>).author && ((entry as Record<string, unknown>).author as Record<string, unknown>).display_name)).filter(Boolean) as string[];
      return {
        candidate_id: candidateId("openalex", stringValue(work.id) ?? title),
        title,
        authors,
        year: numberValue(work.publication_year),
        venue: stringValue(source?.display_name),
        doi,
        openalex_id: stringValue(work.id),
        source_urls: urls,
        pdf_urls: pdfUrls,
        abstract: invertedAbstract(work.abstract_inverted_index),
        retrieval_sources: ["openalex"],
        retrieval_queries: [options.query],
        confidence: "high" as const
      };
    });
  });
}

function invertedAbstract(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const words: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(value as Record<string, unknown>)) {
    for (const position of asArray(positions)) {
      const index = numberValue(position);
      if (index != null) words.push([index, word]);
    }
  }
  if (!words.length) return undefined;
  return words.sort((a, b) => a[0] - b[0]).map(([, word]) => word).join(" ");
}
