import type { LiteratureAdapterOptions } from "../types.js";
import { asArray, candidateId, compact, fetchJson, firstUrl, numberValue, stringValue, guardedAdapter } from "./common.js";

export async function searchSemanticScholar(options: LiteratureAdapterOptions) {
  return guardedAdapter("semantic-scholar", options, async () => {
    const url = new URL("https://api.semanticscholar.org/graph/v1/paper/search");
    url.searchParams.set("query", options.query);
    url.searchParams.set("limit", String(options.limit));
    url.searchParams.set("fields", "title,authors,year,venue,externalIds,url,abstract,openAccessPdf,citationCount");
    const json = await fetchJson<{ data?: unknown[] }>(url.toString(), options);
    return asArray(json.data).map((item) => {
      const paper = item as Record<string, unknown>;
      const external = paper.externalIds as Record<string, unknown> | undefined;
      const openAccessPdf = paper.openAccessPdf as Record<string, unknown> | undefined;
      const title = compact(stringValue(paper.title) ?? "Untitled Semantic Scholar paper");
      const doi = stringValue(external?.DOI);
      return {
        candidate_id: candidateId("semantic-scholar", stringValue(paper.paperId) ?? doi ?? title),
        title,
        authors: asArray(paper.authors).map((author) => stringValue((author as Record<string, unknown>).name)).filter(Boolean) as string[],
        year: numberValue(paper.year),
        venue: stringValue(paper.venue),
        doi,
        arxiv_id: stringValue(external?.ArXiv),
        semantic_scholar_id: stringValue(paper.paperId),
        source_urls: firstUrl(stringValue(paper.url), doi ? `https://doi.org/${doi}` : undefined),
        pdf_urls: firstUrl(stringValue(openAccessPdf?.url)),
        abstract: stringValue(paper.abstract),
        retrieval_sources: ["semantic-scholar"],
        retrieval_queries: [options.query],
        confidence: "medium" as const
      };
    });
  });
}
