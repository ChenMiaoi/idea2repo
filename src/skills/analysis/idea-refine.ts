import type { StrictScoreResult } from "./ccf-a-score.js";
import type { NoveltyAssessment } from "./novelty-matrix.js";

export type StrategyArtifactSource = {
  revised_idea?: string;
  central_hypothesis?: string;
  baselines?: string[];
  datasets?: string[];
  metrics?: string[];
  ablations?: string[];
  failure_cases?: string[];
  first_4_week_plan?: string[];
  paper_story?: string;
};

export type StrictProposalInput = {
  idea: string;
  novelty: NoveltyAssessment;
  score: StrictScoreResult;
  targetVenue?: string;
  contributionType?: string;
  baselines?: string[];
  datasets?: string[];
  metrics?: string[];
  ablations?: string[];
  failureCases?: string[];
  resources?: string[];
  timelineWeeks?: number;
  strategy?: StrategyArtifactSource | null;
};

export function revisedIdeaMarkdown(idea: string, novelty: NoveltyAssessment, score: StrictScoreResult): string {
  return strictRevisedIdeaMarkdown({ idea, novelty, score });
}

export function strictRevisedIdeaMarkdown(input: StrictProposalInput): string {
  const context = proposalContext(input);
  return `# Revised Idea

## One-Sentence Claim

${context.claim}

## Hypothesis

${context.hypothesis}

## Prior-Work Delta

${context.priorWorkDelta}

## Target Venue

${context.targetVenue}

## Contribution Type

${context.contributionType}

## Revised Direction

${context.revisedIdea}

## Proof Obligations

${markdownList(context.proofObligations, "No proof obligation has been cleared; keep claims preliminary until evidence is verified.")}

## Baselines

${markdownList(context.baselines, "Blocked until verified notes identify reviewer-expected baselines.")}

## Datasets

${markdownList(context.datasets, "Blocked until verified notes identify datasets or benchmarks.")}

## Metrics

${markdownList(context.metrics, "Blocked until verified notes identify reviewer-facing metrics.")}

## Score Constraints To Resolve

${markdownList(context.scoreConstraints, "No active deterministic score caps.")}
`;
}

export function strictExecutionPlanMarkdown(input: StrictProposalInput): string {
  const context = proposalContext(input);
  return `# Strict Execution Plan

## One-Sentence Claim

${context.claim}

## Hypothesis

${context.hypothesis}

## Prior-Work Delta

${context.priorWorkDelta}

## Target Venue

${context.targetVenue}

## Contribution Type

${context.contributionType}

## Proof Obligations

${markdownList(context.proofObligations, "No proof obligation has been cleared; keep claims preliminary until evidence is verified.")}

## 12-Week Execution Table

| Week | Focus | Exit Evidence |
| --- | --- | --- |
${twelveWeekRows(context)}

## Baselines

${markdownList(context.baselines, "Blocked until verified notes identify reviewer-expected baselines.")}

## Datasets

${markdownList(context.datasets, "Blocked until verified notes identify datasets or benchmarks.")}

## Metrics

${markdownList(context.metrics, "Blocked until verified notes identify reviewer-facing metrics.")}

## Ablations

${markdownList(context.ablations, "Define component-removal ablations before claiming method gains.")}

## Failure Cases

${markdownList(context.failureCases, "Collect negative examples and boundary conditions during the first experimental pass.")}

## Reproducibility Commands / Paths

${markdownList(context.reproducibility, "Record commands, seeds, configs, and output paths before experiments begin.")}
`;
}

export function solutionDesignMarkdown(input: StrictProposalInput): string {
  const context = proposalContext(input);
  return `# Solution Design

## One-Sentence Claim

${context.claim}

## Hypothesis

${context.hypothesis}

## Prior-Work Delta

${context.priorWorkDelta}

## Target Venue

${context.targetVenue}

## Contribution Type

${context.contributionType}

## Proposed Solution

${context.revisedIdea}

## Method Components

${markdownList(context.methodComponents, "Keep the solution scoped to a minimal method or benchmark change until evidence justifies expansion.")}

## Proof Obligations

${markdownList(context.proofObligations, "No proof obligation has been cleared; keep claims preliminary until evidence is verified.")}

## Baselines

${markdownList(context.baselines, "Blocked until verified notes identify reviewer-expected baselines.")}

## Datasets

${markdownList(context.datasets, "Blocked until verified notes identify datasets or benchmarks.")}

## Metrics

${markdownList(context.metrics, "Blocked until verified notes identify reviewer-facing metrics.")}

## Ablations

${markdownList(context.ablations, "Define component-removal ablations before claiming method gains.")}

## Failure Cases

${markdownList(context.failureCases, "Collect negative examples and boundary conditions during the first experimental pass.")}

## Reproducibility Commands / Paths

${markdownList(context.reproducibility, "Record commands, seeds, configs, and output paths before experiments begin.")}
`;
}

export function experimentPlanMarkdown(): string {
  return `# Experiment Plan

- Baselines: choose at least one strong recent baseline after PDF triage.
- Datasets: use a public benchmark or owned dataset with documented access.
- Metrics: define one primary metric and secondary robustness/failure metrics.
- Ablations: remove each claimed method component.
- Failure cases: collect negative examples and boundary conditions.
- Reproducibility: log seeds, commands, versions, and hardware.
`;
}

export function feasibilityMarkdown(resources: string[] = [], timelineWeeks = 12): string {
  const singlePerson = resources.some((resource) => /single|solo|one/i.test(resource));
  return `# Feasibility Report

- Timeline: ${timelineWeeks} weeks
- Resources: ${resources.join(", ") || "unspecified"}
- MVP: literature verification, one baseline, one dataset, one metric, one ablation.
- Ambitious extension: broader benchmark suite and additional venues.
- Risk: ${singlePerson && timelineWeeks <= 12 ? "single-person 12-week scope must stay narrow" : "scope must be checked against available compute and data"}.
`;
}

export function legacyRevisedIdeaMarkdown(idea: string, novelty: NoveltyAssessment, score: StrictScoreResult): string {
  return `# Revised Idea

## Starting Point

${idea}

## Revised Direction

Focus the project on a narrow, testable claim that survives the current collision risk: ${novelty.defensible_gap}

## Central Hypothesis

A measurable method or benchmark change will improve a reviewer-relevant metric over verified baselines under a documented resource constraint.

## Score Constraints To Resolve

${score.caps.map((cap) => `- ${cap.reason}`).join("\n") || "- No active caps."}
`;
}

type ProposalContext = {
  claim: string;
  hypothesis: string;
  priorWorkDelta: string;
  targetVenue: string;
  contributionType: string;
  revisedIdea: string;
  proofObligations: string[];
  scoreConstraints: string[];
  baselines: string[];
  datasets: string[];
  metrics: string[];
  ablations: string[];
  failureCases: string[];
  methodComponents: string[];
  reproducibility: string[];
  firstFourWeekPlan: string[];
};

function proposalContext(input: StrictProposalInput): ProposalContext {
  const strategy = input.strategy ?? null;
  const revisedIdea = cleanText(
    strategy?.revised_idea ??
      `Focus the project on a narrow, testable claim that survives the current collision risk: ${input.novelty.defensible_gap}`
  );
  const hypothesis = cleanText(
    strategy?.central_hypothesis ??
      "A measurable method or benchmark change will improve a reviewer-relevant metric over verified baselines under a documented resource constraint."
  );
  const baselines = uniqueNonEmpty([...(strategy?.baselines ?? []), ...(input.baselines ?? [])]);
  const datasets = uniqueNonEmpty([...(strategy?.datasets ?? []), ...(input.datasets ?? [])]);
  const metrics = uniqueNonEmpty([...(strategy?.metrics ?? []), ...(input.metrics ?? [])]);
  const ablations = uniqueNonEmpty([...(strategy?.ablations ?? []), ...(input.ablations ?? [])]);
  const failureCases = uniqueNonEmpty([...(strategy?.failure_cases ?? []), ...(input.failureCases ?? [])]);
  const proofObligations = uniqueNonEmpty([
    `Verify the prior-work delta with page, quote, and chunk evidence: ${input.novelty.defensible_gap}`,
    baselines.length ? `Beat or explain reviewer-expected baselines: ${baselines.join("; ")}` : "Identify reviewer-expected baselines from verified paper notes.",
    datasets.length ? `Run the claim on documented datasets or benchmarks: ${datasets.join("; ")}` : "Lock at least one documented dataset or benchmark.",
    metrics.length ? `Report primary and secondary metrics: ${metrics.join("; ")}` : "Define primary and secondary reviewer-facing metrics.",
    "Record ablations, failure cases, seeds, commands, configs, and output paths before promoting claims."
  ]);
  const scoreConstraints = uniqueNonEmpty(input.score.caps.map((cap) => cap.reason));
  const targetVenue = cleanText(input.targetVenue ?? "CCF-A target venue selected after the venue gate passes.");
  const contributionType = cleanText(input.contributionType ?? inferContributionType(input.idea));
  const claim = cleanText(
    `This project claims that ${sentenceFragment(revisedIdea)} can satisfy a ${targetVenue} reviewer by proving ${sentenceFragment(hypothesis)}.`
  );
  const firstFourWeekPlan = uniqueNonEmpty(strategy?.first_4_week_plan ?? []);
  return {
    claim,
    hypothesis,
    priorWorkDelta: cleanText(input.novelty.defensible_gap || "No defensible prior-work delta has been established yet."),
    targetVenue,
    contributionType,
    revisedIdea,
    proofObligations,
    scoreConstraints,
    baselines,
    datasets,
    metrics,
    ablations,
    failureCases,
    methodComponents: methodComponents(revisedIdea, contributionType),
    reproducibility: reproducibilityItems(input.resources ?? [], input.timelineWeeks ?? 12),
    firstFourWeekPlan
  };
}

function twelveWeekRows(context: ProposalContext): string {
  const weeks = [
    ["1", context.firstFourWeekPlan[0] ?? "Finalize search plan, core candidate set, and PDF provenance.", "docs/relative_work/search_plan.md; docs/reference/pdf_manifest.json"],
    ["2", context.firstFourWeekPlan[1] ?? "Write verified paper notes for selected/core papers.", "docs/reference/paper_notes/ with page, quote, and chunk ids"],
    ["3", context.firstFourWeekPlan[2] ?? "Synthesize related-work survey and idea-vs-prior comparison.", "docs/relative_work/survey.md; docs/relative_work/idea_vs_prior_work.md"],
    ["4", context.firstFourWeekPlan[3] ?? "Lock hypothesis, baselines, datasets, metrics, ablations, and failure cases.", "docs/proposal/revised_idea.md; docs/proposal/strict_execution_plan.md"],
    ["5", "Reproduce the strongest baseline and document setup friction.", "src/baselines/; configs/; results/baseline/"],
    ["6", "Implement the minimal method or benchmark change.", "src/method/; src/evaluation/"],
    ["7", "Run main experiments on the selected dataset or benchmark.", "experiments/main/; results/main/"],
    ["8", "Run ablations and sensitivity checks.", "experiments/ablations/; results/ablations/"],
    ["9", "Collect failure cases and boundary-condition analysis.", "experiments/failure_cases/; results/failure_cases/"],
    ["10", "Refresh scorecard and reviewer tasks from produced evidence.", "docs/diagnosis/ccf_a_strict_scorecard.md; docs/diagnosis/rebuttal_tasks.md"],
    ["11", "Draft paper sections from evidence-backed claims only.", "paper/sections/; paper/main.tex"],
    ["12", "Run reproducibility, packaging, and venue-compliance checks.", "paper/submission/; docs/submission/"]
  ];
  return weeks.map(([week, focus, evidence]) => `| ${week} | ${focus} | ${evidence} |`).join("\n");
}

function methodComponents(revisedIdea: string, contributionType: string): string[] {
  return uniqueNonEmpty([
    `Scope: ${contributionType}`,
    `Core mechanism or artifact: ${sentenceFragment(revisedIdea)}`,
    "Input contract: verified related-work evidence, selected datasets or benchmarks, and explicit baseline definitions.",
    "Output contract: reproducible results, ablations, failure cases, and scorecard updates tied to artifact paths."
  ]);
}

function reproducibilityItems(resources: string[], timelineWeeks: number): string[] {
  return [
    "Command: npm run typecheck",
    "Command: npm test",
    "Command: node --import tsx --test test/research-pipeline.test.ts test/analysis.test.ts",
    "Path: docs/relative_work/survey.md",
    "Path: docs/relative_work/idea_vs_prior_work.md",
    "Path: docs/reference/paper_notes/",
    "Path: docs/diagnosis/ccf_a_strict_scorecard.md",
    `Timeline: ${timelineWeeks} weeks`,
    `Resources: ${resources.join("; ") || "unspecified"}`
  ];
}

function inferContributionType(idea: string): string {
  const lower = idea.toLowerCase();
  if (/\bbenchmark|dataset|evaluation suite\b/.test(lower)) return "Benchmark / evaluation contribution";
  if (/\bsystem|tool|runtime|platform\b/.test(lower)) return "System contribution with empirical evaluation";
  if (/\bmethod|algorithm|model|approach\b/.test(lower)) return "Method contribution with controlled experiments";
  return "Method / benchmark contribution";
}

function markdownList(items: string[], fallback: string): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : `- ${fallback}`;
}

function uniqueNonEmpty(items: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of items) {
    const cleaned = cleanText(item);
    if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
    seen.add(cleaned.toLowerCase());
    unique.push(cleaned);
  }
  return unique;
}

function sentenceFragment(value: string): string {
  return cleanText(value).replace(/[.]+$/u, "");
}

function cleanText(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(" ").trim();
}
