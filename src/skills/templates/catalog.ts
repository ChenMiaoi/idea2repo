import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { VenueTemplateProfile } from "./types.js";

export function templateProfilesDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), "data", "template_profiles"),
    resolve(moduleDir, "..", "data", "template_profiles"),
    resolve(moduleDir, "..", "..", "..", "data", "template_profiles")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

export function latexTemplatesDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), "data", "latex_templates"),
    resolve(moduleDir, "..", "data", "latex_templates"),
    resolve(moduleDir, "..", "..", "..", "data", "latex_templates")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

export function loadTemplateProfiles(path = templateProfilesDir()): VenueTemplateProfile[] {
  return readdirSync(path)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(path, file), "utf8")) as VenueTemplateProfile);
}

export function validateTemplateProfiles(profiles = loadTemplateProfiles()): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const profile of profiles) {
    if (!profile.profile_id) errors.push("profile_id is required");
    if (ids.has(profile.profile_id)) errors.push(`${profile.profile_id}: duplicate profile_id`);
    ids.add(profile.profile_id);
    if (!profile.venue_key) errors.push(`${profile.profile_id}: venue_key is required`);
    if (!profile.venue_name) errors.push(`${profile.profile_id}: venue_name is required`);
    if (!profile.template_family) errors.push(`${profile.profile_id}: template_family is required`);
    if (!profile.review_modes?.length) errors.push(`${profile.profile_id}: review_modes is required`);
    if (!profile.review_modes.includes(profile.default_review_mode)) errors.push(`${profile.profile_id}: default_review_mode must be in review_modes`);
    if (!profile.latex?.main_tex_template) errors.push(`${profile.profile_id}: latex.main_tex_template is required`);
    if (!profile.latex?.section_template_dir) errors.push(`${profile.profile_id}: latex.section_template_dir is required`);
    if (!profile.latex?.compile_engine) errors.push(`${profile.profile_id}: latex.compile_engine is required`);
    if (!profile.required_files?.length) errors.push(`${profile.profile_id}: required_files is required`);
    if (!Array.isArray(profile.notes)) errors.push(`${profile.profile_id}: notes must be an array`);
  }
  return errors;
}
