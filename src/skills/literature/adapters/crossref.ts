import type { LiteratureAdapterOptions } from "../types.js";
import { asArray, candidateId, compact, fetchJson, firstUrl, numberValue, stringValue, guardedAdapter } from "./common.js";

export async function searchCrossref(options: LiteratureAdapterOptions) {
  return guardedAdapter("crossref", options, async () => {
    const url = new URL("https://api.crossref.org/works");
    url.searchParams.set("query", options.query);
    url.searchParams.set("rows", String(options.limit));
    const json = await fetchJson<{ message?: { items?: unknown[] } }>(url.toString(), options);
    return asArray(json.message?.items).map((item) => {
      const work = item as Record<string, unknown>;
      const title = compact(stringValue(asArray(work.title)[0]) ?? "Untitled Crossref work");
      const doi = stringValue(work.DOI);
      const authors = asArray(work.author).map((author) => {
        const entry = author as Record<string, unknown>;
        return [stringValue(entry.given), stringValue(entry.family)].filter(Boolean).join(" ");
      }).filter(Boolean);
      const firstDatePart = asArray(asArray((work.published as Record<string, unknown> | undefined)?.["date-parts"])[0]);
      const year = numberValue(firstDatePart[0]);
      return {
        candidate_id: candidateId("crossref", doi ?? title),
        title,
        authors,
        year,
        venue: stringValue(asArray(work["container-title"])[0]),
        doi,
        source_urls: firstUrl(stringValue(work.URL), doi ? `https://doi.org/${doi}` : undefined),
        pdf_urls: [],
        abstract: stripTags(stringValue(work.abstract)),
        retrieval_sources: ["crossref"],
        retrieval_queries: [options.query],
        confidence: doi ? "high" as const : "medium" as const
      };
    });
  });
}

function stripTags(value: string | undefined): string | undefined {
  return value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
