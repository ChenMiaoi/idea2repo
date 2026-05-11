import assert from "node:assert/strict";
import { readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { loadTemplateProfiles, resolveTemplateProfile, validateTemplateProfiles } from "../src/index.js";

test("template profiles validate required ACM and IEEE metadata", () => {
  const profiles = loadTemplateProfiles();
  assert.equal(validateTemplateProfiles(profiles).join("\n"), "");
  assert.ok(profiles.some((profile) => profile.profile_id === "acm-sigconf" && profile.template_family === "acm"));
  assert.ok(profiles.some((profile) => profile.profile_id === "ieee-conference" && profile.template_family === "ieee"));
});

test("template resolver handles exact venue alias domain family and unknown fallback", async () => {
  const acm = await resolveTemplateProfile({ venue: "ACM CCS", year: 2026, mode: "review" });
  assert.equal(acm.profile.profile_id, "acm-sigconf");
  assert.equal(acm.confidence, "high");

  const ieee = await resolveTemplateProfile({ venue: "IEEE S&P" });
  assert.equal(ieee.profile.profile_id, "ieee-conference");
  assert.equal(ieee.confidence, "high");

  const domain = await resolveTemplateProfile({ domain: "security" });
  assert.equal(domain.profile.domain, "security");
  assert.equal(domain.confidence, "medium");

  const family = await resolveTemplateProfile({ family: "acm" });
  assert.equal(family.profile.profile_id, "acm-sigconf");
  assert.equal(family.confidence, "medium");

  const unknown = await resolveTemplateProfile({ venue: "Completely Unknown Symposium" });
  assert.equal(unknown.profile.profile_id, "generic-article");
  assert.equal(unknown.confidence, "low");
});

test("templates CLI lists validates and writes submission decision artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-templates-"));
  const output = join(root, "project");
  try {
    assert.equal(await main(["templates", "list"]), 0);
    assert.equal(await main(["templates", "validate"]), 0);
    assert.equal(await main(["templates", "show", "--venue", "ACM CCS", "--output", output, "--year", "2026"]), 0);
    const profilePath = join(output, "docs/submission/venue_template_profile.json");
    const decisionPath = join(output, "docs/submission/template_decision.md");
    assert.equal((await stat(profilePath)).isFile(), true);
    assert.equal((await stat(decisionPath)).isFile(), true);
    const profile = JSON.parse(await readFile(profilePath, "utf8")) as { profile_id?: string };
    assert.equal(profile.profile_id, "acm-sigconf");
    assert.match(await readFile(decisionPath, "utf8"), /Template Decision/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
