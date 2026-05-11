import type { LiteratureAdapterOptions } from "../types.js";
import { asArray, candidateId, compact, fetchJson, firstUrl, numberValue, stringValue, guardedAdapter } from "./common.js";

export async function searchDblp(options: LiteratureAdapterOptions) {
  return guardedAdapter("dblp", options, async () => {
    const url = new URL("https://dblp.org/search/publ/api");
    url.searchParams.set("q", options.query);
    url.searchParams.set("format", "json");
    url.searchParams.set("h", String(options.limit));
    const json = await fetchJson<{ result?: { hits?: { hit?: unknown[] } } }>(url.toString(), options);
    return asArray(json.result?.hits?.hit).map((hit) => {
      const info = (hit as Record<string, unknown>).info as Record<string, unknown>;
      const key = stringValue((hit as Record<string, unknown>)["@id"]) ?? stringValue(info.key);
      const title = compact(stringValue(info.title) ?? "Untitled DBLP record");
      return {
        candidate_id: candidateId("dblp", key ?? title),
        title,
        authors: authors(info),
        year: numberValue(info.year),
        venue: stringValue(info.venue),
        dblp_key: stringValue(info.key),
        doi: stringValue(info.doi),
        source_urls: firstUrl(stringValue(info.url), stringValue(info.ee), stringValue(info.doi) ? `https://doi.org/${stringValue(info.doi)}` : undefined),
        pdf_urls: [],
        retrieval_sources: ["dblp"],
        retrieval_queries: [options.query],
        confidence: "high" as const
      };
    });
  });
}

function authors(info: Record<string, unknown>): string[] {
  const author = (info.authors as Record<string, unknown> | undefined)?.author;
  if (Array.isArray(author)) return author.map((item) => stringValue(typeof item === "object" ? (item as Record<string, unknown>).text : item)).filter(Boolean) as string[];
  const single = stringValue(typeof author === "object" ? (author as Record<string, unknown>).text : author);
  return single ? [single] : [];
}
