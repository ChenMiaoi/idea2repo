import { searchAclAnthology } from "./adapters/acl-anthology.js";
import { searchArxiv } from "./adapters/arxiv.js";
import { searchCrossref } from "./adapters/crossref.js";
import { searchDblp } from "./adapters/dblp.js";
import { searchOpenAlex } from "./adapters/openalex.js";
import { searchSemanticScholar } from "./adapters/semantic-scholar.js";
import { dedupeCandidates } from "./dedupe.js";
import { rankCandidates } from "./rank.js";
import type { LiteratureAdapterOptions, LiteratureAdapterResult, LiteratureSearchOptions, LiteratureSearchResult, LiteratureSource, PaperCandidate } from "./types.js";

export const defaultLiteratureSources: LiteratureSource[] = ["openalex", "crossref", "arxiv", "dblp", "semantic-scholar", "acl-anthology"];

export async function searchLiteratureDeterministic(options: LiteratureSearchOptions): Promise<LiteratureSearchResult> {
  const queries = normalizeQueries(options);
  const limit = options.limit ?? 20;
  if (!options.allowNetwork) {
    return {
      candidates: [],
      warnings: queries.map((query) => `Network disabled. Search manually: ${query}`),
      search_report: searchReport([], queries, [`Network disabled. Search manually: ${queries.join("; ")}`])
    };
  }
  const sources = normalizeSources(options.sources);
  const fetchImpl = options.fetchImpl ?? fetch;
  const perSourceLimit = Math.max(1, Math.ceil(limit / Math.max(1, Math.min(queries.length * sources.length, limit))));
  const results: LiteratureAdapterResult[] = [];
  for (const query of queries) {
    const adapterOptions: LiteratureAdapterOptions = { query, limit: perSourceLimit, fetchImpl };
    for (const source of sources) results.push(await runAdapter(source, adapterOptions));
  }
  const warnings = results.flatMap((result) => result.warnings);
  const candidates = rankCandidates(dedupeCandidates(results.flatMap((result) => result.candidates)), options.idea ?? queries.join(" ")).slice(0, limit);
  if (candidates.length < Math.min(8, limit)) warnings.push(`Only ${candidates.length} candidates found; expand recall queries before novelty judgment.`);
  return { candidates, warnings, search_report: searchReport(candidates, queries, warnings) };
}

export function searchReport(candidates: PaperCandidate[], queries: string[], warnings: string[] = []): string {
  return `# Literature Search Report

## Queries

${queries.map((query) => `- ${query}`).join("\n") || "- none"}

## Candidates

| Rank | Title | Year | Venue | Sources | Score | PDF |
| ---: | --- | ---: | --- | --- | ---: | --- |
${(candidates.length ? candidates : []).map((candidate, index) => `| ${index + 1} | ${escapeCell(candidate.title)} | ${candidate.year ?? ""} | ${escapeCell(candidate.venue ?? "")} | ${candidate.retrieval_sources.join("; ")} | ${candidate.relevance_score ?? ""} | ${candidate.pdf_urls.length ? "yes" : "no"} |`).join("\n") || "|  | No candidates yet |  |  |  |  |  |"}

## Warnings

${warnings.map((warning) => `- ${warning}`).join("\n") || "- none"}
`;
}

function normalizeQueries(options: LiteratureSearchOptions): string[] {
  return [...new Set([...(options.queries ?? []), options.query ?? ""].map((query) => query.trim()).filter(Boolean))];
}

async function runAdapter(source: LiteratureSource, options: LiteratureAdapterOptions): Promise<LiteratureAdapterResult> {
  if (source === "openalex") return searchOpenAlex(options);
  if (source === "crossref") return searchCrossref(options);
  if (source === "arxiv") return searchArxiv(options);
  if (source === "dblp") return searchDblp(options);
  if (source === "semantic-scholar") return searchSemanticScholar(options);
  return searchAclAnthology(options);
}

export function normalizeSources(sources: LiteratureSource[] | undefined): LiteratureSource[] {
  if (!sources?.length) return defaultLiteratureSources;
  const allowed = new Set(defaultLiteratureSources);
  const invalid = sources.filter((source) => !allowed.has(source));
  if (invalid.length) throw new Error(`unknown literature source: ${invalid.join(", ")}`);
  return [...new Set(sources)];
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
