import { loadVenueDatabase } from "../../venues.js";
import type { PaperCandidate } from "./types.js";

export function rankCandidates(candidates: PaperCandidate[], idea = ""): PaperCandidate[] {
  return candidates
    .map((candidate) => ({ ...candidate, relevance_score: relevanceScore(candidate, idea) }))
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0) || (b.year ?? 0) - (a.year ?? 0));
}

export function relevanceScore(candidate: PaperCandidate, idea = ""): number {
  const text = `${candidate.title} ${candidate.abstract ?? ""}`.toLowerCase();
  const ideaTerms = terms(idea);
  const semantic = ideaTerms.length ? ideaTerms.filter((term) => text.includes(term)).length / ideaTerms.length : 0.2;
  const keyword = ["baseline", "benchmark", "dataset", "metric", "agent", "security", "system", "evaluation"].filter((term) => text.includes(term)).length / 8;
  const venue = venueSignal(candidate.venue);
  const recency = candidate.year == null ? 0.3 : Math.max(0, Math.min(1, (candidate.year - 2018) / 8));
  const prominence = candidate.doi || candidate.openalex_id || candidate.dblp_key || candidate.semantic_scholar_id ? 0.7 : 0.2;
  const pdf = candidate.pdf_urls.length ? 1 : 0;
  return round(0.35 * semantic + 0.2 * keyword + 0.15 * venue + 0.15 * recency + 0.1 * prominence + 0.05 * pdf);
}

function venueSignal(venue: string | undefined): number {
  if (!venue) return 0;
  const normalized = venue.toLowerCase();
  const database = loadVenueDatabase();
  for (const domain of Object.values(database.domains)) {
    for (const name of [...domain.primary_venues, ...domain.secondary_venues]) {
      if (normalized.includes(name.toLowerCase())) return 1;
    }
  }
  return 0.3;
}

function terms(value: string): string[] {
  return [...new Set(value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((term) => term.length > 3))].slice(0, 20);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
