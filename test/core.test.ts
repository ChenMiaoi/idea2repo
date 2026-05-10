import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { generateResearchRepo, resumeResearchRepo, slugify } from "../src/generator.js";
import { status, validate, readManifest } from "../src/state.js";
import { canonicalProvider, containsSecretMaterial } from "../src/providers.js";
import { loadVenueDatabase, validateVenueDatabase } from "../src/venues.js";
import { filterUnsupportedModels, loadCodexModelCatalog } from "../src/models.js";

test("offline generation writes manifest metadata and validates", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-core-"));
  const output = join(root, "中文 path", "Research Repo");
  try {
    const result = await generateResearchRepo(
      "Build an LLM agent benchmark with evaluation metrics, baselines, ablations, recent 2026 literature, and failure cases.",
      output,
      {
        offline: true,
        provider: "offline",
        stack: "ts",
        requestedDomains: ["AI/LLM Agent"],
        resources: ["single-researcher"],
        timelineWeeks: 12
      }
    );
    assert.equal(result.analysis_source, "offline_fallback");
    assert.equal(result.provider_id, "offline");
    assert.ok(result.files.length > 40);
    assert.equal((await validate(output)).length, 0);
    const current = await status(output);
    assert.equal(current.modified_artifacts.length, 0);
    assert.equal(current.missing_artifacts.length, 0);
    const manifest = await readManifest(output);
    assert.equal(manifest.version, 1);
    assert.equal(manifest.generation.runtime, "node");
    assert.equal(manifest.generation.provider_id, "offline");
    assert.equal(manifest.generation.api_shape, "deterministic-fallback");
    assert.equal(manifest.request.stack, "ts");
    const packageJson = JSON.parse(await readFile(join(output, "package.json"), "utf8")) as { type: string };
    assert.equal(packageJson.type, "module");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resume restores missing generated artifacts without overwriting existing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-resume-"));
  try {
    await generateResearchRepo("A systems benchmark with latency, throughput, baselines, datasets, and metrics.", root, {
      offline: true,
      provider: "offline",
      requestedDomains: ["systems"]
    });
    await unlink(join(root, "docs/diagnosis/risk_register.md"));
    let current = await status(root);
    assert.ok(current.missing_artifacts.includes("docs/diagnosis/risk_register.md"));
    const resumed = await resumeResearchRepo(root);
    assert.ok(resumed.files.some((file) => file.endsWith("docs/diagnosis/risk_register.md")));
    current = await status(root);
    assert.equal(current.missing_artifacts.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("provider secret detector and venue database work", () => {
  assert.equal(containsSecretMaterial("OPENAI_API_KEY=sk-test"), true);
  assert.equal(containsSecretMaterial("OPENAI_API_KEY=<redacted>"), false);
  assert.equal(canonicalProvider("openai-codex-oauth"), "openai-codex");
  assert.deepEqual(filterUnsupportedModels([{ provider: "openai-codex", id: "gpt-5.1-codex" }, { provider: "openai-codex", id: "gpt-5.3-codex-spark" }]), [
    { provider: "openai-codex", id: "gpt-5.3-codex-spark" }
  ]);
  const catalog = loadCodexModelCatalog({
    runner: () =>
      JSON.stringify({
        models: [
          {
            slug: "gpt-5.5",
            display_name: "GPT-5.5",
            default_reasoning_level: "medium",
            supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }, { effort: "high" }, { effort: "xhigh" }],
            visibility: "list"
          },
          { slug: "codex-auto-review", display_name: "Codex Auto Review", visibility: "hide" }
        ]
      })
  });
  assert.equal(catalog.source, "codex-debug-models");
  assert.equal(catalog.default_model, "gpt-5.5");
  assert.deepEqual(catalog.models.map((model) => model.id), ["gpt-5.5"]);
  assert.equal(slugify("Idea / Repo: Test"), "idea-repo-test");
  assert.deepEqual(validateVenueDatabase(loadVenueDatabase()), []);
});
