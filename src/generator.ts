import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { evidenceGateMarkdown, evaluateEvidenceGate, type EvidenceGate } from "./evidence.js";
import { type PaperRecord, literatureTasksMd, referencesBib, relatedWorkCsv, csv } from "./literature.js";
import { defaultPolicy, policyAsDict, requirePermission, type PermissionPolicy } from "./permissions.js";
import {
  apiShapeForProvider,
  canonicalProvider,
  CODEX_CLI_PROVIDER_ID,
  LEGACY_OAUTH_PROVIDER_ID,
  OFFLINE_PROVIDER_ID,
  OPENAI_CODEX_PROVIDER_ID,
  providerSchemaJson,
  safeProviderReport,
  type ProviderMode
} from "./providers.js";
import { diagnoseIdea, type Diagnosis } from "./scoring.js";
import { safeSecurityReframe, securityGuardrailMarkdown } from "./security.js";
import { appendRunLog, ensureChild, exists, readManifest, RUN_LOG_PATH, writeManifest, writeText } from "./state.js";
import type { ProjectManifest, ResearchAnalysis } from "./types.js";
import { inspectWorkspace } from "./workspace.js";
import { runWorkflow, workflowSummary } from "./workflow.js";
import { CodexOAuthClient } from "./auth/codex-oauth.js";

export type Stack = "python" | "ts";

export type GenerateOptions = {
  requestedDomains?: string[];
  timelineWeeks?: number;
  resources?: string[];
  force?: boolean;
  createdAt?: string;
  permissionPolicy?: PermissionPolicy;
  verifiedPapers?: PaperRecord[];
  literatureTasks?: string[];
  baselines?: string[];
  datasets?: string[];
  metrics?: string[];
  claimEvidenceRows?: Record<string, string>[];
  stack?: Stack;
  offline?: boolean;
  provider?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
  derivedConfig?: Record<string, unknown>;
  discussionAssumptions?: string[];
  progressCallback?: (message: string) => void;
};

export type GeneratedProject = {
  root: string;
  project_name: string;
  files: string[];
  diagnosis: Diagnosis;
  analysis_source: "codex" | "offline_fallback";
  provider_id: string;
  api_shape: string;
  model: string | null;
  reasoning_effort: string | null;
  codex_available: boolean;
  codex_logged_in: boolean;
  fallback_reason: string;
  research_analysis: ResearchAnalysis | null;
};

type ProviderAnalysis = {
  analysis: ResearchAnalysis | null;
  selectedProvider: ProviderMode;
  selectedApiShape: string;
  fallbackReason: string;
};

export async function generateResearchRepo(idea: string, output: string, options: GenerateOptions = {}): Promise<GeneratedProject> {
  if (!idea.trim()) throw new Error("idea must not be empty");
  const timelineWeeks = options.timelineWeeks ?? 12;
  if (![8, 12, 16, 24].includes(timelineWeeks)) throw new Error("timeline_weeks must be one of: 8, 12, 16, 24");
  const stack = options.stack ?? "python";
  if (stack !== "python" && stack !== "ts") throw new Error("stack must be one of: python, ts");

  const root = resolve(output);
  const policy = options.permissionPolicy ?? defaultPolicy({ allowOverwrite: options.force });
  if ((await exists(root)) && (await nonEmpty(root)) && !options.force) {
    throw new Error(`output directory already exists and is not empty: ${root}`);
  }
  if ((await exists(root)) && (await nonEmpty(root))) requirePermission(policy, "overwrite", root);
  requirePermission(policy, "write", root);

  const createdAt = options.createdAt ?? today();
  const providerAnalysis = await analyzeWithProvider(idea, {
    ...options,
    timelineWeeks,
    resources: options.resources ?? [],
    stack
  });
  const analysis = providerAnalysis.analysis;
  const literatureTasks = options.literatureTasks ?? analysis?.related_work_queries ?? [];
  const claimEvidenceRows = options.claimEvidenceRows ?? (analysis ? analysisClaimEvidenceRows(analysis) : undefined);
  const evidenceGate = evaluateEvidenceGate(options.verifiedPapers ?? [], {
    baselines: options.baselines,
    datasets: options.datasets,
    metrics: options.metrics,
    claimEvidenceRows
  });
  let diagnosis = diagnoseIdea(idea, {
    requestedDomains: options.requestedDomains,
    verifiedPapers: options.verifiedPapers,
    baselines: options.baselines,
    datasets: options.datasets,
    metrics: options.metrics,
    claimEvidenceRows
  });
  if (analysis) diagnosis = diagnosisFromAnalysis(diagnosis, analysis);

  const artifactIdea = safeSecurityReframe(idea, diagnosis.security_assessment);
  const projectName = slugify(root.split(/[\\/]/).pop() || idea);
  const workspace = inspectWorkspace();
  const providerReport = providerConfigReport({
    analysis,
    fallbackReason: providerAnalysis.fallbackReason,
    providerId: providerAnalysis.selectedProvider,
    apiShape: providerAnalysis.selectedApiShape,
    model: options.model,
    reasoningEffort: options.reasoningEffort
  });
  const fileMap = buildFiles({
    projectName,
    idea: artifactIdea,
    diagnosis,
    createdAt,
    timelineWeeks,
    resources: options.resources ?? [],
    workspace,
    verifiedPapers: options.verifiedPapers ?? [],
    literatureTasks,
    claimEvidenceRows,
    evidenceGate,
    stack,
    analysis,
    providerReport,
    providerId: providerAnalysis.selectedProvider,
    apiShape: providerAnalysis.selectedApiShape
  });

  const written: string[] = [];
  options.progressCallback?.("Artifacts: writing repository scaffold");
  for (const [relativePath, content] of Object.entries(fileMap)) {
    const path = ensureChild(root, relativePath);
    await writeText(path, ensureTrailingNewline(content));
    written.push(path);
  }
  for (const directory of emptyDirectories()) {
    const keepFile = ensureChild(root, join(directory, ".gitkeep"));
    await writeText(keepFile, "");
    written.push(keepFile);
  }

  const manifestPath = await writeManifest(root, {
    projectName,
    idea: artifactIdea,
    requestedDomains: options.requestedDomains ?? [],
    timelineWeeks,
    resources: options.resources ?? [],
    stack,
    createdAt,
    files: written,
    permissions: policyAsDict(policy),
    workspace,
    generation: generationMetadata({
      analysis,
      fallbackReason: providerAnalysis.fallbackReason,
      selectedProvider: providerAnalysis.selectedProvider,
      requestedProvider: options.provider ?? null,
      selectedApiShape: providerAnalysis.selectedApiShape,
      model: options.model ?? null,
      reasoningEffort: options.reasoningEffort ?? null,
      derivedConfig: options.derivedConfig,
      discussionAssumptions: options.discussionAssumptions
    })
  });
  written.push(manifestPath, join(root, RUN_LOG_PATH));
  options.progressCallback?.("Artifacts: manifest and status written");

  return {
    root,
    project_name: projectName,
    files: written,
    diagnosis,
    analysis_source: analysis ? "codex" : "offline_fallback",
    provider_id: providerAnalysis.selectedProvider,
    api_shape: providerAnalysis.selectedApiShape,
    model: options.model ?? null,
    reasoning_effort: options.reasoningEffort ?? null,
    codex_available: Boolean(analysis),
    codex_logged_in: Boolean(analysis),
    fallback_reason: providerAnalysis.fallbackReason,
    research_analysis: analysis
  };
}

export async function resumeResearchRepo(output: string, options: { force?: boolean; permissionPolicy?: PermissionPolicy } = {}): Promise<GeneratedProject> {
  const root = resolve(output);
  const policy = options.permissionPolicy ?? defaultPolicy({ allowOverwrite: options.force });
  requirePermission(policy, "write", join(root, RUN_LOG_PATH));
  if (options.force) requirePermission(policy, "overwrite", root);
  const manifest = await readManifest(root);
  await appendRunLog(root, "resume_started", { force: Boolean(options.force) });
  const result = await regenerateFromManifest(root, manifest, options.force ?? false, policy);
  await appendRunLog(root, "resume_completed", { files: result.files.length });
  return result;
}

export function slugify(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.slice(0, 64) || "idea2repo-project";
}

async function analyzeWithProvider(
  idea: string,
  options: GenerateOptions & { timelineWeeks: number; resources: string[]; stack: Stack }
): Promise<ProviderAnalysis> {
  const selectedProvider = canonicalProvider(options.provider, Boolean(options.offline));
  const selectedApiShape = apiShapeForProvider(selectedProvider);
  if (selectedProvider === OFFLINE_PROVIDER_ID) {
    options.progressCallback?.("Provider: offline");
    options.progressCallback?.("Analysis: offline deterministic fallback");
    return { analysis: null, selectedProvider, selectedApiShape, fallbackReason: "offline mode requested" };
  }
  if (selectedProvider === CODEX_CLI_PROVIDER_ID) {
    return {
      analysis: null,
      selectedProvider,
      selectedApiShape,
      fallbackReason: "codex CLI structured adapter is not enabled in this TypeScript migration yet"
    };
  }
  try {
    options.progressCallback?.(`Provider: ${selectedProvider}`);
    const client = new CodexOAuthClient({
      model: options.model ?? undefined,
      reasoningEffort: options.reasoningEffort ?? undefined
    });
    const result = await client.analyzeIdea(idea, {
      requestedDomains: options.requestedDomains,
      timelineWeeks: options.timelineWeeks,
      resources: options.resources,
      stack: options.stack,
      progress: options.progressCallback
    });
    const analysis = result.analysis;
    return { analysis, selectedProvider, selectedApiShape, fallbackReason: "" };
  } catch (error) {
    options.progressCallback?.("Analysis: provider fallback selected");
    return {
      analysis: null,
      selectedProvider,
      selectedApiShape,
      fallbackReason: error instanceof Error ? error.message : "unknown provider failure"
    };
  }
}

function diagnosisFromAnalysis(diagnosis: Diagnosis, analysis: ResearchAnalysis): Diagnosis {
  return {
    ...diagnosis,
    raw_score: {
      ...diagnosis.raw_score,
      total: analysis.raw_score.total,
      uncapped_total: Math.max(analysis.raw_score.total, diagnosis.raw_score.uncapped_total)
    },
    revised_score: {
      ...diagnosis.revised_score,
      total: analysis.revised_score.total,
      uncapped_total: Math.max(analysis.revised_score.total, diagnosis.revised_score.uncapped_total)
    },
    required_evidence: analysis.revised_plan.evidence_required?.length ? analysis.revised_plan.evidence_required : diagnosis.required_evidence,
    risks: analysis.risks?.length ? analysis.risks : diagnosis.risks,
    revised_plan: analysis.revised_plan.key_changes?.length ? analysis.revised_plan.key_changes : diagnosis.revised_plan,
    revised_plan_text: analysis.revised_plan.summary
  };
}

function analysisClaimEvidenceRows(analysis: ResearchAnalysis): Record<string, string>[] {
  return (analysis.revised_plan.evidence_required ?? []).slice(0, 8).map((evidence, index) => ({
    claim: `TODO: Codex-planned claim ${index + 1}`,
    required_evidence: evidence,
    planned_artifact: "results/tables/",
    status: "planned"
  }));
}

async function regenerateFromManifest(root: string, manifest: ProjectManifest, force: boolean, policy: PermissionPolicy): Promise<GeneratedProject> {
  const request = manifest.request;
  const diagnosis = diagnoseIdea(request.idea, { requestedDomains: request.requested_domains });
  const projectName = manifest.project_name || slugify(root.split(/[\\/]/).pop() || request.idea);
  const files = buildFiles({
    projectName,
    idea: request.idea,
    diagnosis,
    createdAt: manifest.created_at || today(),
    timelineWeeks: request.timeline_weeks,
    resources: request.resources,
    workspace: manifest.workspace,
    verifiedPapers: [],
    literatureTasks: [],
    evidenceGate: evaluateEvidenceGate(),
    stack: request.stack,
    analysis: null,
    providerReport: safeProviderReport(OFFLINE_PROVIDER_ID),
    providerId: OFFLINE_PROVIDER_ID,
    apiShape: apiShapeForProvider(OFFLINE_PROVIDER_ID)
  });
  const written: string[] = [];
  for (const [relativePath, content] of Object.entries(files)) {
    const path = ensureChild(root, relativePath);
    if ((await exists(path)) && !force) continue;
    if (await exists(path)) requirePermission(policy, "overwrite", path);
    requirePermission(policy, "write", path);
    await writeText(path, ensureTrailingNewline(content));
    written.push(path);
  }
  for (const directory of emptyDirectories()) {
    const keepFile = ensureChild(root, join(directory, ".gitkeep"));
    if ((await exists(keepFile)) && !force) continue;
    if (await exists(keepFile)) requirePermission(policy, "overwrite", keepFile);
    await writeText(keepFile, "");
    written.push(keepFile);
  }
  if (force) {
    const manifestPath = await writeManifest(root, {
      projectName,
      idea: request.idea,
      requestedDomains: request.requested_domains,
      timelineWeeks: request.timeline_weeks,
      resources: request.resources,
      stack: request.stack,
      createdAt: manifest.created_at || today(),
      files: written,
      permissions: policyAsDict(policy),
      workspace: manifest.workspace,
      generation: {
        runtime: "node",
        analysis_source: "offline_fallback",
        provider_id: OFFLINE_PROVIDER_ID,
        api_shape: apiShapeForProvider(OFFLINE_PROVIDER_ID),
        fallback_reason: "resume uses manifest deterministic fallback"
      }
    });
    written.push(manifestPath);
  }
  return {
    root,
    project_name: projectName,
    files: written,
    diagnosis,
    analysis_source: "offline_fallback",
    provider_id: OFFLINE_PROVIDER_ID,
    api_shape: apiShapeForProvider(OFFLINE_PROVIDER_ID),
    model: null,
    reasoning_effort: null,
    codex_available: false,
    codex_logged_in: false,
    fallback_reason: "resume uses manifest deterministic fallback",
    research_analysis: null
  };
}

function buildFiles(options: {
  projectName: string;
  idea: string;
  diagnosis: Diagnosis;
  createdAt: string;
  timelineWeeks: number;
  resources: string[];
  workspace: Record<string, unknown>;
  verifiedPapers: PaperRecord[];
  literatureTasks: string[];
  claimEvidenceRows?: Record<string, string>[];
  evidenceGate: EvidenceGate;
  stack: Stack;
  analysis: ResearchAnalysis | null;
  providerReport: string;
  providerId: string;
  apiShape: string;
}): Record<string, string> {
  const route = options.diagnosis.routes[0]!;
  const claimRows = claimEvidenceRows(options.claimEvidenceRows);
  const files: Record<string, string> = {
    "README.md": rootReadme(options.projectName, options.idea, options.diagnosis),
    ".gitignore": generatedGitignore(),
    ".dockerignore": generatedDockerignore(),
    ".env.example": envExample(),
    "project.yaml": projectYaml(options),
    "requirements.txt": requirementsTxt(),
    "pyproject.toml": generatedPyproject(options.projectName),
    "docs/diagnosis/ccf_a_readiness_report.md": options.analysis
      ? analysisReadinessReport(options.analysis, options.diagnosis, options.timelineWeeks, options.providerId, options.apiShape)
      : readinessReport(options.projectName, options.idea, options.diagnosis, options.timelineWeeks),
    "docs/diagnosis/raw_idea_score.md": scoreReport("Raw Idea Score", options.diagnosis.raw_score),
    "docs/diagnosis/revised_plan_score.md": scoreReport("Revised Plan Score", options.diagnosis.revised_score),
    "docs/diagnosis/evidence_gate.md": evidenceGateMarkdown(options.evidenceGate),
    "docs/diagnosis/security_guardrail.md": securityGuardrailMarkdown(options.diagnosis.security_assessment),
    "docs/diagnosis/risk_register.md": riskRegister(options.diagnosis),
    "docs/diagnosis/reviewer_simulation.md": options.analysis?.reviewer_simulation
      ? `# Reviewer Simulation\n\n${options.analysis.reviewer_simulation}\n`
      : reviewerSimulation(options.diagnosis),
    "docs/survey/survey.md": survey(options.diagnosis, options.analysis),
    "docs/survey/paper_map.md": paperMap(options.analysis),
    "docs/survey/topic_clusters.md": topicClusters(options.analysis),
    "docs/survey/trend_analysis.md": trendAnalysis(),
    "docs/survey/open_problems.md": openProblems(options.diagnosis, options.analysis),
    "docs/reference/references.bib": referencesBib(options.verifiedPapers),
    "docs/reference/related_work_matrix.csv": relatedWorkCsv(options.verifiedPapers),
    "docs/reference/literature_search_tasks.md": literatureTasksMd(options.literatureTasks),
    "docs/reference/claim_evidence_matrix.csv": csv(claimRows),
    "docs/reference/paper_notes/README.md": "# Paper Notes\n\nAdd one note per verified paper. Include source URL, BibTeX key, claim relevance, and collision risk.\n",
    "docs/reference/pdfs/README.md": "# PDFs\n\nDo not commit publisher PDFs unless the license explicitly permits it. Record citation metadata in `docs/reference/related_work_matrix.csv`.\n",
    [`docs/execution_plan/${options.timelineWeeks}_week_plan.md`]: timelinePlan(options.diagnosis, options.timelineWeeks, options.resources, options.analysis),
    "docs/execution_plan/milestones.md": milestones(),
    "docs/execution_plan/todo.md": todo(options.diagnosis, options.analysis),
    "docs/execution_plan/compute_budget.md": computeBudget(route.domain.key, options.resources),
    "docs/execution_plan/experiment_checklist.md": experimentChecklist(route.domain.key),
    "docs/meeting/weekly_update_template.md": weeklyUpdateTemplate(),
    "docs/meeting/advisor_report.md": advisorReport(options.diagnosis),
    "docs/runtime/platform_notes.md": platformNotes(),
    "docs/runtime/provider_config.md": options.providerReport,
    "docs/runtime/provider_schema.json": providerSchemaJson(),
    "docs/runtime/workspace_snapshot.md": workspaceSnapshot(options.workspace),
    "docs/workflow/README.md": workflowSummary(),
    "paper/main.tex": mainTex(options.projectName),
    "paper/macros.tex": "% Shared paper macros.\n\\newcommand{\\toolname}{Idea2RepoProject}\n",
    "paper/sections/00_abstract.tex": sectionTex("Abstract"),
    "paper/sections/01_introduction.tex": introductionTex(options.diagnosis),
    "paper/sections/02_related_work.tex": relatedWorkTex(),
    "paper/sections/03_problem_formulation.tex": sectionTex("Problem Formulation"),
    "paper/sections/04_method.tex": sectionTex("Method"),
    "paper/sections/05_experiments.tex": experimentsTex(route.domain.key),
    "paper/sections/06_discussion.tex": sectionTex("Discussion"),
    "paper/sections/07_conclusion.tex": sectionTex("Conclusion"),
    "src/README.md": "# Source\n\nKeep reusable method, baseline, evaluation, and utility code here.\n",
    "src/research_project/__init__.py": "\"\"\"Generated research project package.\"\"\"\n",
    "src/research_project/runner.py": researchRunner(),
    "src/research_project/result_logger.py": resultLoggerPy(),
    "src/method/README.md": componentReadme("method implementation"),
    "src/baselines/README.md": componentReadme("baseline reproductions"),
    "src/evaluation/README.md": componentReadme("evaluation code"),
    "src/utils/README.md": componentReadme("shared utilities"),
    "experiments/README.md": "# Experiments\n\nEach experiment folder must include config, command, expected outputs, and result interpretation.\n",
    "configs/README.md": "# Configs\n\nStore experiment configuration files here. Avoid secrets and local absolute paths.\n",
    "data/README.md": "# Data\n\n`data/raw` and `data/processed` are intentionally gitignored except `.gitkeep` files.\n",
    "results/README.md": "# Results\n\nCommit only compact, non-sensitive tables or figures that support paper claims.\n",
    "scripts/README.md": "# Scripts\n\nKeep reproducible run scripts here.\n",
    "scripts/run.sh": "#!/usr/bin/env bash\nset -euo pipefail\npython -m research_project.runner \"$@\"\n",
    "scripts/run.ps1": "python -m research_project.runner @args\n",
    "tests/test_smoke.py": "def test_smoke():\n    assert True\n",
    "docker/Dockerfile": "FROM python:3.12-slim\nWORKDIR /workspace\nCOPY . /workspace\nCMD [\"python\", \"-m\", \"research_project.runner\"]\n",
    "docker/docker-compose.yml": "services:\n  research:\n    build:\n      context: ..\n      dockerfile: docker/Dockerfile\n",
    ".github/workflows/ci.yml": generatedGithubCi(options.stack),
    ".github/workflows/README.md": "# GitHub Workflows\n\nGenerated CI validates formatting, tests, and artifact sanity once project-specific checks are added.\n",
    ".github/ISSUE_TEMPLATE/research_task.md": issueTemplate()
  };
  if (options.stack === "ts") {
    Object.assign(files, {
      "package.json": generatedPackageJson(options.projectName),
      "tsconfig.json": generatedTsconfig(),
      "src/index.ts": generatedTsIndex(),
      "tests/smoke.test.ts": generatedTsSmokeTest()
    });
  }
  Object.assign(files, runWorkflow(options.diagnosis));
  return files;
}

function claimEvidenceRows(rows: Record<string, string>[] | undefined): string[][] {
  const header = ["claim", "required_evidence", "planned_artifact", "status"];
  if (!rows?.length) return [header, ["TODO: paper claim", "TODO: metric/table/figure", "results/tables/", "planned"]];
  return [header, ...rows.map((row) => [row.claim ?? "", row.required_evidence ?? "", row.planned_artifact ?? "", row.status ?? "planned"])];
}

function generationMetadata(options: {
  analysis: ResearchAnalysis | null;
  fallbackReason: string;
  selectedProvider: string;
  requestedProvider: string | null;
  selectedApiShape: string;
  model: string | null;
  reasoningEffort: string | null;
  derivedConfig?: Record<string, unknown>;
  discussionAssumptions?: string[];
}): Record<string, unknown> {
  return {
    runtime: "node",
    analysis_source: options.analysis ? "codex" : "offline_fallback",
    provider_id: options.selectedProvider,
    api_shape: options.selectedApiShape,
    model: options.model,
    reasoning_effort: options.reasoningEffort,
    provider_alias_migration:
      options.requestedProvider === LEGACY_OAUTH_PROVIDER_ID
        ? { from: LEGACY_OAUTH_PROVIDER_ID, to: OPENAI_CODEX_PROVIDER_ID }
        : null,
    derived_config: options.derivedConfig ?? {},
    discussion_assumptions: options.discussionAssumptions ?? [],
    fallback_reason: options.fallbackReason
  };
}

function providerConfigReport(options: {
  analysis: ResearchAnalysis | null;
  fallbackReason: string;
  providerId: string;
  apiShape: string;
  model?: string | null;
  reasoningEffort?: string | null;
}): string {
  if (!options.analysis) {
    if (options.fallbackReason === "offline mode requested") return safeProviderReport(OFFLINE_PROVIDER_ID);
    return `# Provider Configuration

## Active Provider

- Provider ID: ${options.providerId}
- API shape: ${options.apiShape}
- Provider unavailable for this generation
- Fallback reason: ${options.fallbackReason || "unknown"}

## Boundary

- Offline fallback used deterministic local artifacts and did not call a model.
- Do not read ~/.codex auth files, scrape browser cookies, or write tokens into this repository.
`;
  }
  return `# Provider Configuration

## Active Provider

- Provider ID: ${options.providerId}
- API shape: ${options.apiShape}
- Provider: Idea2Repo OAuth Codex Responses
- Login: logged in
- Model: ${options.model || "codex default"}
- Reasoning effort: ${options.reasoningEffort || "model default"}

## Boundary

- Do not read ~/.codex auth files or scrape browser cookies.
- Store generated research artifacts only; never write tokens or private provider responses.
`;
}

function rootReadme(projectName: string, idea: string, diagnosis: Diagnosis): string {
  const route = diagnosis.routes[0]!;
  return `# ${projectName}

CCF-A readiness research repository generated by Idea2Repo.

## Raw Idea

${idea}

## Current Diagnosis

- Primary route: ${route.domain.label}
- Candidate venues: ${route.domain.primary_venues.join(", ")}
- Raw idea score: ${diagnosis.raw_score.total} / 100
- Revised plan score: ${diagnosis.revised_score.total} / 100
- Main report: \`docs/diagnosis/ccf_a_readiness_report.md\`

## Grounding Policy

This repo intentionally contains placeholders for papers and experiments. Add only verified papers with traceable links and BibTeX. Do not write experimental claims until the evidence exists in \`results/\`.
`;
}

function generatedGitignore(): string {
  return `# Python / runtime caches
__pycache__/
*.py[cod]
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
coverage.xml
htmlcov/

# Local environments and credentials
.env
.env.*
!.env.example
!.env.sample
.venv/
venv/
.envrc
.direnv/
secrets/
*.pem
*.key
*.crt
*.p12
*.pfx
*.jks
*.keystore
*.token
*.secret
credentials.json
token.json

# Node caches
node_modules/
dist/
.vite/
.turbo/
npm-debug.log*
coverage/

# Research data and generated outputs
generated_repos/
.idea2repo/
data/raw/*
data/processed/*
results/logs/*
results/tables/*
results/figures/*
!data/raw/.gitkeep
!data/processed/.gitkeep
!results/logs/.gitkeep
!results/tables/.gitkeep
!results/figures/.gitkeep
artifacts/
runs/
outputs/
`;
}

function generatedDockerignore(): string {
  return `__pycache__/
.git/
.idea2repo/
.venv/
venv/
node_modules/
data/raw/
data/processed/
results/logs/
results/tables/
results/figures/
`;
}

function envExample(): string {
  return `# Runtime configuration. Do not commit real secrets.
IDEA2REPO_PROVIDER=offline
`;
}

function projectYaml(options: {
  projectName: string;
  idea: string;
  diagnosis: Diagnosis;
  createdAt: string;
  timelineWeeks: number;
  resources: string[];
}): string {
  const route = options.diagnosis.routes[0]!;
  return `project: ${yaml(options.projectName)}
created_at: ${yaml(options.createdAt)}
idea: ${yaml(options.idea)}
primary_domain: ${yaml(route.domain.key)}
candidate_venues:
${route.domain.primary_venues.map((venue) => `  - ${yaml(venue)}`).join("\n")}
timeline_weeks: ${options.timelineWeeks}
resources:
${(options.resources.length ? options.resources : ["unspecified"]).map((resource) => `  - ${yaml(resource)}`).join("\n")}
scores:
  raw: ${options.diagnosis.raw_score.total}
  revised: ${options.diagnosis.revised_score.total}
`;
}

function requirementsTxt(): string {
  return `pytest>=8.0
`;
}

function generatedPyproject(projectName: string): string {
  return `[project]
name = "${projectName}"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = []

[tool.pytest.ini_options]
testpaths = ["tests"]
`;
}

function readinessReport(projectName: string, idea: string, diagnosis: Diagnosis, timelineWeeks: number): string {
  const route = diagnosis.routes[0]!;
  return `# CCF-A Readiness Report

## Executive Summary

- Project: ${projectName}
- Idea: ${idea}
- Primary route: ${route.domain.label}
- Candidate venues: ${route.domain.primary_venues.join(", ")}
- Raw Idea Score: ${diagnosis.raw_score.total} / 100
- Revised Plan Score: ${diagnosis.revised_score.total} / 100

## Raw Idea Diagnosis

Cap triggers: ${diagnosis.raw_score.cap_triggers.join(", ") || "none"}

## Revised Research Plan

${diagnosis.revised_plan_text}

## Required Evidence

${markdownList(diagnosis.required_evidence)}

## Risks

${markdownList(diagnosis.risks)}

## Execution Plan

See \`docs/execution_plan/${timelineWeeks}_week_plan.md\`.
`;
}

function analysisReadinessReport(analysis: ResearchAnalysis, diagnosis: Diagnosis, timelineWeeks: number, providerId: string, apiShape: string): string {
  return `# CCF-A Readiness Report

Analysis source: Codex (${providerId}, ${apiShape})

## Executive Summary

- Idea: ${analysis.idea_summary}
- Problem: ${analysis.problem_statement}
- Primary route: ${analysis.domain_route.label}
- Candidate venues: ${(analysis.domain_route.candidate_venues ?? []).join(", ") || "verify from current venue sources"}
- Raw Idea Score: ${analysis.raw_score.total} / 100
- Revised Plan Score: ${analysis.revised_score.total} / 100
- Feasibility: ${analysis.feasibility}

## Route Rationale

${analysis.domain_route.rationale}

## Raw Idea Diagnosis

${analysis.raw_score.rationale}

Cap reasons:
${markdownList(analysis.raw_score.cap_reasons ?? ["No explicit cap reason returned by Codex."])}

## Revised Research Plan

${analysis.revised_plan.summary}

Key changes:
${markdownList(analysis.revised_plan.key_changes ?? ["TODO: refine with advisor feedback."])}

Required evidence:
${markdownList(analysis.revised_plan.evidence_required ?? diagnosis.required_evidence)}

## Novelty Gaps

${markdownList(analysis.novelty_gaps ?? ["Verify novelty against recent related work before claiming a gap."])}

## Risks

${markdownList(analysis.risks ?? diagnosis.risks)}

## Execution Plan

See \`docs/execution_plan/${timelineWeeks}_week_plan.md\`.
`;
}

function scoreReport(title: string, score: Diagnosis["raw_score"]): string {
  const dimensions = Object.entries(score.dimensions).map(([name, value]) => `| ${name} | ${value} |`);
  return `# ${title}

- Final score: ${score.total} / 100
- Uncapped score: ${score.uncapped_total} / 100
- Cap triggers: ${score.cap_triggers.join(", ") || "none"}
- Cap limit: ${score.cap_limit ?? "none"}

| Dimension | Score |
| --- | --- |
${dimensions.join("\n")}
`;
}

function riskRegister(diagnosis: Diagnosis): string {
  return `# Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
${diagnosis.risks.map((risk) => `| ${risk} | High | Add traceable evidence before making claims. |`).join("\n")}
`;
}

function reviewerSimulation(diagnosis: Diagnosis): string {
  return `# Reviewer Simulation

Likely reviewer concerns:

${markdownList(diagnosis.risks)}

Required fixes before submission:

${markdownList(diagnosis.required_evidence)}
`;
}

function survey(diagnosis: Diagnosis, analysis: ResearchAnalysis | null): string {
  const route = diagnosis.routes[0]!;
  return `# Survey

## Scope

Primary route: ${analysis?.domain_route.label ?? route.domain.label}

## Initial Search Queries

${markdownList(analysis?.related_work_queries ?? ["TODO: add verified search queries."])}

## Paper Clusters

${paperClusterMarkdown(analysis)}
`;
}

function paperMap(analysis: ResearchAnalysis | null): string {
  const rows =
    analysis?.paper_clusters?.map((cluster) => `| ${cluster.name} | ${(cluster.representative_papers ?? []).join("; ") || "source-needed"} | ${cluster.core_problem} | ${cluster.collision_risk} |`) ??
    [];
  return `# Paper Map

| Cluster | Representative Papers | Core Question | Collision Risk |
| --- | --- | --- | --- |
${(rows.length ? rows : ["| TODO | TODO | TODO | Unknown until verified |"]).join("\n")}
`;
}

function topicClusters(analysis: ResearchAnalysis | null): string {
  const rows =
    analysis?.paper_clusters?.map((cluster) => `| ${cluster.name} | ${cluster.core_problem} | ${cluster.method_pattern} | ${(analysis.novelty_gaps ?? []).slice(0, 2).join("; ") || "verify against related work"} |`) ??
    [];
  return `# Topic Clusters

| Cluster | Problem | Method Pattern | Open Gap |
| --- | --- | --- | --- |
${(rows.length ? rows : ["| TODO | TODO | TODO | TODO |"]).join("\n")}
`;
}

function trendAnalysis(): string {
  return `# Trend Analysis

- Track publication years, benchmark changes, and method families after literature verification.
- Separate real trends from one-off papers.
`;
}

function openProblems(diagnosis: Diagnosis, analysis: ResearchAnalysis | null): string {
  return `# Open Problems

${markdownList(analysis?.novelty_gaps ?? diagnosis.required_evidence)}
`;
}

function timelinePlan(diagnosis: Diagnosis, weeks: number, resources: string[], analysis: ResearchAnalysis | null): string {
  const resourceText = resources.join(", ") || "unspecified";
  if (analysis?.timeline?.length) {
    const items = analysis.timeline.map((item) => `## Week ${item.week}

- Deliverable: ${item.deliverable}
- Exit criteria: ${item.exit_criteria}
`);
    return `# ${weeks} Week Plan

Resource constraints: ${resourceText}

${items.join("\n")}`;
  }
  const phases = [
    "Verify related work and collision risk.",
    "Finalize baselines, datasets, and metrics.",
    "Implement baseline reproduction and minimal method prototype.",
    "Run main experiments, ablations, and failure-case analysis.",
    "Write paper sections only after evidence artifacts exist."
  ];
  return `# ${weeks} Week Plan

Resource constraints: ${resourceText}

${phases.map((phase, index) => `## Phase ${index + 1}\n\n- Deliverable: ${phase}\n- Exit criteria: claim-evidence matrix updated.\n`).join("\n")}

## Required Evidence

${markdownList(diagnosis.required_evidence)}
`;
}

function milestones(): string {
  return `# Milestones

| Milestone | Exit Criteria | Target |
| --- | --- | --- |
| M1 Related work verified | Matrix contains source URLs and BibTeX | Week 2 |
| M2 Baselines locked | Baseline commands and metrics are documented | Week 4 |
| M3 Main results measured | Tables and figures map to claims | Week 8 |
| M4 Paper draft complete | All claims link to evidence | Final week |
`;
}

function todo(diagnosis: Diagnosis, analysis: ResearchAnalysis | null): string {
  return `# TODO

${markdownList([
    "Verify latest CCF and venue information before publication-critical claims.",
    ...(analysis?.related_work_queries?.slice(0, 5) ?? []),
    ...diagnosis.required_evidence
  ])}
`;
}

function computeBudget(domain: string, resources: string[]): string {
  return `# Compute Budget

- Domain: ${domain}
- Resources: ${resources.join(", ") || "unspecified"}
- Log every run command, hardware detail, runtime, seed, and failure.
`;
}

function experimentChecklist(domain: string): string {
  return `# Experiment Checklist

- [ ] Baselines selected and reproduced.
- [ ] Datasets or workloads documented.
- [ ] Metrics match paper claims.
- [ ] Ablations isolate each method component.
- [ ] Failure cases are collected and explained.
- [ ] Domain-specific checks completed for ${domain}.
`;
}

function weeklyUpdateTemplate(): string {
  return `# Weekly Update

## Progress

- 

## Evidence Added

- 

## Blockers

- 

## Next Week

- 
`;
}

function advisorReport(diagnosis: Diagnosis): string {
  return `# Advisor Report

- Raw score: ${diagnosis.raw_score.total} / 100
- Revised score: ${diagnosis.revised_score.total} / 100
- Biggest risks:

${markdownList(diagnosis.risks)}
`;
}

function platformNotes(): string {
  return `# Platform Notes

- Generated by the TypeScript Idea2Repo runtime.
- Manifest version remains 1 for generated repositories.
- Provider credentials must stay outside this repository.
`;
}

function workspaceSnapshot(workspace: Record<string, unknown>): string {
  return `# Workspace Snapshot

\`\`\`json
${JSON.stringify(workspace, null, 2)}
\`\`\`
`;
}

function mainTex(projectName: string): string {
  return `\\documentclass{article}
\\input{macros}
\\title{${latexEscape(projectName)}}
\\author{TODO}
\\begin{document}
\\maketitle
\\input{sections/00_abstract}
\\input{sections/01_introduction}
\\input{sections/02_related_work}
\\input{sections/03_problem_formulation}
\\input{sections/04_method}
\\input{sections/05_experiments}
\\input{sections/06_discussion}
\\input{sections/07_conclusion}
\\bibliographystyle{plain}
\\bibliography{../docs/reference/references}
\\end{document}
`;
}

function sectionTex(title: string): string {
  return `\\section{${latexEscape(title)}}\n\nTODO: write this section after the claim-evidence matrix is filled.\n`;
}

function introductionTex(diagnosis: Diagnosis): string {
  return `\\section{Introduction}

TODO: introduce the problem, motivation, contribution, and evidence boundary.

Required evidence:
${diagnosis.required_evidence.map((item) => `% - ${item}`).join("\n")}
`;
}

function relatedWorkTex(): string {
  return `\\section{Related Work}

TODO: write only after verified papers are added to docs/reference/related_work_matrix.csv.
`;
}

function experimentsTex(domain: string): string {
  return `\\section{Experiments}

TODO: include baselines, datasets, metrics, ablations, failure cases, and ${latexEscape(domain)}-specific validity checks.
`;
}

function researchRunner(): string {
  return `from __future__ import annotations


def main() -> None:
    print("TODO: implement reproducible experiment runner")


if __name__ == "__main__":
    main()
`;
}

function resultLoggerPy(): string {
  return `from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def write_result(path: str | Path, payload: dict[str, Any]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\\n", encoding="utf-8")
`;
}

function componentReadme(component: string): string {
  return `# ${capitalize(component)}

Document assumptions, inputs, outputs, and commands for ${component}.
`;
}

function generatedGithubCi(stack: Stack): string {
  if (stack === "ts") {
    return `name: generated-research-ci

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
      - run: npm test
`;
  }
  return `name: generated-research-ci

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: python -m pip install -e .
      - run: python -m pytest
`;
}

function issueTemplate(): string {
  return `---
name: Research task
about: Track a generated research task
title: "[research] "
labels: research
---

## Source Artifact


## Task


## Evidence Needed

`;
}

function generatedPackageJson(projectName: string): string {
  return JSON.stringify(
    {
      name: projectName,
      version: "0.1.0",
      type: "module",
      scripts: {
        test: "node --test tests/*.test.ts"
      },
      devDependencies: {
        tsx: "^4.20.0",
        typescript: "^5.9.0"
      }
    },
    null,
    2
  );
}

function generatedTsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        outDir: "dist"
      },
      include: ["src/**/*.ts", "tests/**/*.ts"]
    },
    null,
    2
  );
}

function generatedTsIndex(): string {
  return `export function main(): string {
  return "TODO: implement reproducible experiment runner";
}
`;
}

function generatedTsSmokeTest(): string {
  return `import assert from "node:assert/strict";
import { test } from "node:test";
import { main } from "../src/index.ts";

test("smoke", () => {
  assert.equal(typeof main(), "string");
});
`;
}

function paperClusterMarkdown(analysis: ResearchAnalysis | null): string {
  if (!analysis?.paper_clusters?.length) return "- TODO: add verified paper clusters.\n";
  return analysis.paper_clusters
    .map(
      (cluster) => `### ${cluster.name}

- Core problem: ${cluster.core_problem}
- Method pattern: ${cluster.method_pattern}
- Collision risk: ${cluster.collision_risk}
- Verification queries: ${(cluster.verification_queries ?? []).join(", ") || "TODO"}
`
    )
    .join("\n");
}

function emptyDirectories(): string[] {
  return [
    "paper/figures",
    "paper/tables",
    "data/raw",
    "data/processed",
    "results/logs",
    "results/tables",
    "results/figures",
    "experiments/exp_001_baseline_reproduction",
    "experiments/exp_002_main_result",
    "experiments/exp_003_ablation",
    "experiments/exp_004_scalability_or_robustness",
    "experiments/exp_005_failure_cases"
  ];
}

async function nonEmpty(path: string): Promise<boolean> {
  try {
    return (await readdir(path)).length > 0;
  } catch {
    return false;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function markdownList(items: string[]): string {
  return (items.length ? items : ["TODO"]).map((item) => `- ${item}`).join("\n");
}

function yaml(value: string): string {
  return JSON.stringify(value);
}

function latexEscape(value: string): string {
  return value.replace(/[\\{}$&#_%]/g, (match) => `\\${match}`);
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
