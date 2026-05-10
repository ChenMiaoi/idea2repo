import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type VenueRecord = {
  name: string;
  full_name: string;
  ccf_category: string;
  domain: string;
  venue_type: string;
  eligible_tracks: string[];
  ineligible_tracks: string[];
  source_url: string;
  dblp_url: string;
  last_checked: string;
  provenance_note: string;
};

export type DomainProfile = {
  key: string;
  label: string;
  primary_venues: string[];
  secondary_venues: string[];
  review_focus: string[];
  keywords: string[];
  aliases: string[];
  venue_records: Record<string, VenueRecord>;
};

export type VenueDatabase = {
  version: string;
  source_note: string;
  domains: Record<string, DomainProfile>;
};

export type DomainRoute = {
  domain: DomainProfile;
  score: number;
  matched_keywords: string[];
  requested: boolean;
};

export function loadVenueDatabase(path?: string): VenueDatabase {
  const dataPath =
    path ??
    resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "venues.json");
  const raw = JSON.parse(readFileSync(dataPath, "utf8").replace(/^\uFEFF/, "")) as {
    version: string;
    source_note: string;
    domains: Record<string, Omit<DomainProfile, "key" | "venue_records"> & { venue_records?: VenueRecord[] }>;
  };
  const domains: Record<string, DomainProfile> = {};
  for (const [key, value] of Object.entries(raw.domains)) {
    const records: Record<string, VenueRecord> = {};
    for (const record of value.venue_records ?? []) records[record.name] = record;
    domains[key] = {
      key,
      label: value.label,
      primary_venues: value.primary_venues,
      secondary_venues: value.secondary_venues,
      review_focus: value.review_focus,
      keywords: value.keywords,
      aliases: value.aliases ?? [],
      venue_records: records
    };
  }
  return { version: raw.version, source_note: raw.source_note, domains };
}

export function routeIdea(
  idea: string,
  database = loadVenueDatabase(),
  requestedDomains: string[] = []
): DomainRoute[] {
  const normalized = idea.toLocaleLowerCase();
  const requested = new Set(requestedDomains.map(normalizeRequest));
  const routes: DomainRoute[] = [];
  for (const [key, profile] of Object.entries(database.domains)) {
    const matched = profile.keywords.filter((keyword) => normalized.includes(keyword.toLocaleLowerCase()));
    const candidates = new Set([
      normalizeRequest(key),
      normalizeRequest(profile.label),
      ...profile.aliases.map(normalizeRequest),
      ...profile.primary_venues.map(normalizeRequest),
      ...profile.secondary_venues.map(normalizeRequest)
    ]);
    const requestedMatch = [...requested].some((value) => candidates.has(value));
    routes.push({
      domain: profile,
      score: matched.length * 10 + (requestedMatch ? 100 : 0),
      matched_keywords: matched,
      requested: requestedMatch
    });
  }
  routes.sort((a, b) => Number(b.requested) - Number(a.requested) || b.score - a.score || b.domain.label.localeCompare(a.domain.label));
  if (routes[0]?.score) return routes;
  const ai = database.domains.ai_llm_agent;
  if (!ai) return routes;
  return [{ domain: ai, score: 1, matched_keywords: [], requested: false }, ...routes.filter((route) => route.domain.key !== "ai_llm_agent")];
}

export function validateVenueDatabase(database = loadVenueDatabase()): string[] {
  const errors: string[] = [];
  if (!database.version) errors.push("database version is required");
  for (const [key, profile] of Object.entries(database.domains)) {
    const listed = new Set([...profile.primary_venues, ...profile.secondary_venues]);
    for (const venue of listed) {
      if (!profile.venue_records[venue]) errors.push(`${key}: missing venue record for ${venue}`);
    }
    for (const [name, record] of Object.entries(profile.venue_records)) {
      if (record.domain !== key) errors.push(`${key}: ${name} has mismatched domain ${record.domain}`);
      if (!["A", "B", "C"].includes(record.ccf_category)) errors.push(`${key}: ${name} has invalid CCF category ${record.ccf_category}`);
      if (!["conference", "journal"].includes(record.venue_type)) errors.push(`${key}: ${name} has invalid venue type ${record.venue_type}`);
      if (!/^https?:\/\//.test(record.source_url)) errors.push(`${key}: ${name} source_url must be absolute`);
      if (!/^https?:\/\//.test(record.dblp_url)) errors.push(`${key}: ${name} dblp_url must be absolute`);
      if (!record.eligible_tracks.includes("Full paper") && !record.eligible_tracks.includes("Regular paper")) {
        errors.push(`${key}: ${name} must include Full paper or Regular paper eligibility`);
      }
      for (const track of ["Workshop", "Demo", "Short paper"]) {
        if (!record.ineligible_tracks.includes(track)) errors.push(`${key}: ${name} must mark workshop/demo/short paper as ineligible`);
      }
    }
  }
  return errors;
}

function normalizeRequest(value: string): string {
  return value.toLocaleLowerCase().replace(/[_\-\/\\|,:;]/g, " ").split(/\s+/).filter(Boolean).join(" ");
}
