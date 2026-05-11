import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { generateResearchRepo } from "../src/generator.js";
import { CODEX_CLI_PROVIDER_ID, OFFLINE_PROVIDER_ID, OPENAI_CODEX_PROVIDER_ID } from "../src/providers.js";
import { CodexCliAdapter, OpenAICodexOAuthAdapter, OfflineAdapter, createProviderAdapter, setProviderAdapterFactoryForTests } from "../src/providers/index.js";
import { runResearchPipeline } from "../src/pipeline/research-pipeline.js";
import { validateResearchAnalysis, type ResearchAnalysis } from "../src/types.js";
import type { ProviderAdapter, StructuredRequest } from "../src/providers/adapter.js";

test("offline provider adapter returns schema-valid deterministic research analysis", async () => {
  const adapter = new OfflineAdapter();
  const status = await adapter.status();
  const analysis = await adapter.structured({
    task: "analyze",
    schemaName: "ResearchAnalysis",
    context: {
      idea: "A local-first research agent benchmark with baselines datasets and metrics.",
      requestedDomains: ["ai"],
      timelineWeeks: 12,
      resources: ["single researcher"],
      stack: "ts"
    },
    validate: validateResearchAnalysis
  });

  assert.equal(await adapter.available(), true);
  assert.equal(status.id, OFFLINE_PROVIDER_ID);
  assert.equal(analysis.domain_route.key, "ai_llm_agent");
  assert.ok(analysis.related_work_queries?.length);
});

test("provider adapter factory wraps offline and Codex OAuth providers", async () => {
  assert.ok(createProviderAdapter(OFFLINE_PROVIDER_ID) instanceof OfflineAdapter);
  assert.ok(createProviderAdapter(OPENAI_CODEX_PROVIDER_ID) instanceof OpenAICodexOAuthAdapter);
  assert.ok(createProviderAdapter("openai-codex-cli") instanceof CodexCliAdapter);
  assert.throws(() => createProviderAdapter("missing"), /unsupported provider adapter/);
});

test("Codex OAuth adapter delegates structured ResearchAnalysis requests to the client", async () => {
  const expected = validateResearchAnalysis({
    schema_version: 1,
    idea_summary: "Adapter test",
    problem_statement: "Need a typed adapter.",
    domain_route: { key: "ai_agent", label: "AI / LLM Agent", rationale: "Agent runtime work." },
    raw_score: { total: 40, rationale: "early" },
    revised_score: { total: 55, rationale: "clearer" },
    feasibility: "feasible",
    revised_plan: { summary: "typed adapter", feasibility: "feasible" },
    experiment_plan: {},
    reviewer_simulation: "Reviewer asks for tests."
  });
  const adapter = new OpenAICodexOAuthAdapter(() => ({
    analyzeIdea: async () => ({ analysis: expected, provider_id: OPENAI_CODEX_PROVIDER_ID, api_shape: "openai-codex-responses", codex_model: "test", events: [] })
  } as any));

  const analysis = await adapter.structured<ResearchAnalysis>({
    task: "analyze",
    schemaName: "ResearchAnalysis",
    context: { idea: "Adapter test" },
    validate: validateResearchAnalysis,
    model: "gpt-test",
    reasoningEffort: "low"
  });
  assert.equal(analysis.idea_summary, "Adapter test");
});

test("research pipeline uses provider adapter for Codex CLI staged agents", async () => {
  const calls: string[] = [];
  const adapter: ProviderAdapter = {
    id: CODEX_CLI_PROVIDER_ID,
    available: async () => true,
    status: async () => ({ id: CODEX_CLI_PROVIDER_ID, available: true }),
    structured: async <T>(request: StructuredRequest<T>) => {
      calls.push(`${request.schemaName}:${request.promptFile ?? ""}`);
      if (request.schemaName === "IdeaBrief") {
        return request.validate({
          idea_summary: "Adapter-driven pipeline idea.",
          problem: "Need adapter driven staged agents.",
          target_domain: "AI / LLM Agent",
          target_venues: ["NeurIPS"],
          method_keywords: ["agent", "runtime"],
          task_keywords: ["benchmark"],
          evaluation_keywords: ["baseline", "dataset", "metric"],
          resource_constraints: ["single researcher"],
          missing_information: [],
          assumptions: ["adapter test"],
          search_seed_terms: ["agent", "runtime", "benchmark"]
        }) as T;
      }
      if (request.schemaName === "SearchPlan") {
        const query = (suffix: string) => ({ query: `adapter runtime ${suffix}`, source_hints: ["openalex"], purpose: "adapter test" });
        return request.validate({
          core_concepts: ["adapter", "runtime"],
          synonyms: ["agent"],
          precision_queries: ["a", "b", "c", "d", "e"].map(query),
          recall_queries: ["f", "g", "h", "i", "j"].map(query),
          baseline_queries: [query("baseline")],
          dataset_metric_queries: [query("dataset metric")],
          venue_queries: [query("neurips")],
          collision_queries: [query("collision")],
          stop_condition: "stop after adapter test"
        }) as T;
      }
      if (request.schemaName === "FeasibilityReview") {
        return request.validate({
          timeline_weeks: 12,
          feasible_mvp: ["adapter mvp"],
          ambitious_extensions: [],
          risks: ["adapter risk"],
          unavailable_resource_warnings: [],
          verdict: "feasible for adapter test"
        }) as T;
      }
      throw new Error(`unexpected schema ${request.schemaName}`);
    }
  };
  setProviderAdapterFactoryForTests((id) => {
    assert.equal(id, CODEX_CLI_PROVIDER_ID);
    return adapter;
  });
  try {
    const result = await runResearchPipeline("Adapter pipeline test", {
      provider: CODEX_CLI_PROVIDER_ID,
      allowNetwork: false,
      timelineWeeks: 12,
      resources: ["single researcher"]
    });
    assert.deepEqual(calls.slice(0, 2), ["IdeaBrief:00_intake_router.md", "SearchPlan:01_search_planner.md"]);
    assert.ok(calls.includes("FeasibilityReview:07_feasibility_reviewer.md"));
    assert.equal(result.ideaBrief.idea_summary, "Adapter-driven pipeline idea.");
  } finally {
    setProviderAdapterFactoryForTests(null);
  }
});

test("generation uses the offline provider adapter while preserving offline fallback metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-provider-adapter-"));
  try {
    const result = await generateResearchRepo("A research agent benchmark with baseline dataset and metric.", join(root, "project"), {
      offline: true,
      provider: OFFLINE_PROVIDER_ID
    });
    assert.equal(result.provider_id, OFFLINE_PROVIDER_ID);
    assert.equal(result.analysis_source, "offline_fallback");
    assert.equal(result.fallback_reason, "offline mode requested");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
