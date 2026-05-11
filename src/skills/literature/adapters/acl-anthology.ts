import type { LiteratureAdapterOptions } from "../types.js";
import { candidateId, compact, fetchText, firstUrl, guardedAdapter } from "./common.js";

export async function searchAclAnthology(options: LiteratureAdapterOptions) {
  return guardedAdapter("acl-anthology", options, async () => {
    const url = new URL("https://aclanthology.org/search/");
    url.searchParams.set("q", options.query);
    const html = await fetchText(url.toString(), options);
    return [...html.matchAll(/<a href="(\/\d{4}\.[^"]+\/)">([\s\S]*?)<\/a>/g)].slice(0, options.limit).map((match) => {
      const sourceUrl = `https://aclanthology.org${match[1]}`;
      const title = compact(stripTags(match[2] ?? "")) || "Untitled ACL Anthology paper";
      return {
        candidate_id: candidateId("acl-anthology", sourceUrl),
        title,
        authors: [],
        year: Number(sourceUrl.match(/\/(\d{4})\./)?.[1]) || null,
        venue: "ACL Anthology",
        source_urls: firstUrl(sourceUrl),
        pdf_urls: firstUrl(`${sourceUrl}.pdf`),
        retrieval_sources: ["acl-anthology"],
        retrieval_queries: [options.query],
        confidence: "low" as const
      };
    });
  });
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}
