import type { LiteratureAdapterOptions } from "../types.js";
import { candidateId, compact, fetchText, firstUrl, guardedAdapter } from "./common.js";

export async function searchArxiv(options: LiteratureAdapterOptions) {
  return guardedAdapter("arxiv", options, async () => {
    const url = new URL("https://export.arxiv.org/api/query");
    url.searchParams.set("search_query", `all:${options.query}`);
    url.searchParams.set("start", "0");
    url.searchParams.set("max_results", String(options.limit));
    const xml = await fetchText(url.toString(), options);
    return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => {
      const entry = match[1] ?? "";
      const id = text(entry, "id");
      const arxivId = id.split("/abs/")[1]?.replace(/v\d+$/, "");
      const title = compact(text(entry, "title") || "Untitled arXiv preprint");
      const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g)].map((author) => compact(decode(author[1] ?? ""))).filter(Boolean);
      const year = Number(text(entry, "published").slice(0, 4)) || null;
      const pdf = entry.match(/<link[^>]+title="pdf"[^>]+href="([^"]+)"/)?.[1];
      return {
        candidate_id: candidateId("arxiv", arxivId ?? id ?? title),
        title,
        authors,
        year,
        venue: "arXiv",
        arxiv_id: arxivId,
        source_urls: firstUrl(id),
        pdf_urls: firstUrl(pdf),
        abstract: compact(text(entry, "summary")),
        retrieval_sources: ["arxiv"],
        retrieval_queries: [options.query],
        confidence: arxivId ? "high" as const : "medium" as const
      };
    });
  });
}

function text(entry: string, tag: string): string {
  return compact(decode(entry.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? ""));
}

function decode(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"");
}
