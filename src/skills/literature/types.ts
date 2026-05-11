export type LiteratureSource = "openalex" | "crossref" | "arxiv" | "dblp" | "semantic-scholar" | "acl-anthology";

export type PaperCandidate = {
  candidate_id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue?: string;
  doi?: string;
  arxiv_id?: string;
  openalex_id?: string;
  dblp_key?: string;
  semantic_scholar_id?: string;
  source_urls: string[];
  pdf_urls: string[];
  abstract?: string;
  retrieval_sources: string[];
  retrieval_queries: string[];
  confidence: "high" | "medium" | "low";
  relevance_score?: number;
};

export type LiteratureAdapterOptions = {
  query: string;
  limit: number;
  fetchImpl: typeof fetch;
};

export type LiteratureAdapterResult = {
  source: LiteratureSource;
  candidates: PaperCandidate[];
  warnings: string[];
};

export type LiteratureSearchOptions = {
  allowNetwork?: boolean;
  queries?: string[];
  query?: string;
  sources?: LiteratureSource[];
  limit?: number;
  idea?: string;
  fetchImpl?: typeof fetch;
};

export type LiteratureSearchResult = {
  candidates: PaperCandidate[];
  warnings: string[];
  search_report: string;
};
