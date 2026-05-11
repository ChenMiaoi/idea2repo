import { loadTemplateProfiles } from "./catalog.js";
import type { TemplateResolveInput, TemplateResolveResult, VenueTemplateProfile } from "./types.js";

export async function resolveTemplateProfile(input: TemplateResolveInput): Promise<TemplateResolveResult> {
  const profiles = loadTemplateProfiles();
  const venue = normalize(input.venue ?? "");
  const exact = profiles.find((profile) => profileMatches(profile, venue));
  if (exact) return result(exact, "high", input);
  const familyDefault = familyProfile(profiles, input.family);
  if (familyDefault) return result(familyDefault, "medium", input, [`Verify official template for requested family ${input.family}.`]);
  const domainDefault = domainProfile(profiles, input.domain);
  if (domainDefault) return result(domainDefault, "medium", input, [`Verify official template for requested domain ${input.domain}.`]);
  const fallback = profiles.find((profile) => profile.profile_id === "generic-article") ?? profiles[0];
  if (!fallback) throw new Error("no template profiles available");
  return result(fallback, "low", input, ["No exact venue or domain profile matched; using generic fallback."]);
}

export function templateDecisionMarkdown(result: TemplateResolveResult, input: TemplateResolveInput): string {
  const profile = result.profile;
  return `# Template Decision

## Request

- Venue: ${input.venue ?? "unspecified"}
- Domain: ${input.domain ?? "unspecified"}
- Family: ${input.family ?? "unspecified"}
- Year: ${input.year ?? "unspecified"}
- Mode: ${input.mode ?? profile.default_review_mode}
- Paper type: ${input.paperType ?? "unspecified"}

## Selected Profile

- Profile: ${profile.profile_id}
- Venue key: ${profile.venue_key}
- Venue name: ${profile.venue_name}
- Template family: ${profile.template_family}
- Confidence: ${result.confidence}
- Needs official verification: ${result.needsOfficialVerification ? "yes" : "no"}
- Official template: ${profile.official_template_url ?? "unverified"}
- Official version: ${profile.official_template_version ?? "unspecified"}

## Required Files

${profile.required_files.map((file) => `- ${file}`).join("\n")}

## Verification Tasks

${result.verificationTasks.length ? result.verificationTasks.map((task) => `- ${task}`).join("\n") : "- None"}

## Notes

${profile.notes.length ? profile.notes.map((note) => `- ${note}`).join("\n") : "- None"}
`;
}

function result(profile: VenueTemplateProfile, confidence: TemplateResolveResult["confidence"], input: TemplateResolveInput, extraTasks: string[] = []): TemplateResolveResult {
  return {
    profile,
    confidence,
    needsOfficialVerification: !profile.official_template_verified_at || confidence !== "high",
    verificationTasks: [
      ...(profile.official_template_verified_at ? [] : [`Verify official template URL for ${profile.venue_name}.`]),
      ...(input.year ? [`Check whether the ${input.year} call-for-papers changed page limits or anonymity rules.`] : []),
      ...extraTasks
    ]
  };
}

function domainProfile(profiles: VenueTemplateProfile[], domain: string | undefined): VenueTemplateProfile | undefined {
  const normalized = normalize(domain ?? "");
  if (!normalized) return undefined;
  return profiles.find((profile) => normalize(profile.domain ?? "") === normalized || normalize(profile.template_family) === normalized || normalize(profile.venue_key).includes(normalized));
}

function familyProfile(profiles: VenueTemplateProfile[], family: string | undefined): VenueTemplateProfile | undefined {
  const normalized = normalize(family ?? "");
  if (!normalized) return undefined;
  return profiles.find((profile) => normalize(profile.template_family) === normalized || normalize(profile.profile_id) === normalized || normalize(profile.venue_key) === normalized);
}

function profileMatches(profile: VenueTemplateProfile, normalizedVenue: string): boolean {
  if (!normalizedVenue) return false;
  return [profile.venue_key, profile.venue_name, ...(profile.aliases ?? [])].map(normalize).some((value) => value === normalizedVenue || value.includes(normalizedVenue) || normalizedVenue.includes(value));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_\-\/\\|,:;]/g, " ").split(/\s+/).filter(Boolean).join(" ");
}
