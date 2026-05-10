import { blockingReasons, submissionReady } from "./evidence.js";
import type { Diagnosis } from "./scoring.js";

type Skill = {
  name: string;
  artifact: string;
  handler: (diagnosis: Diagnosis) => string;
};

export function skillRegistry(): Record<string, Skill> {
  const skills: Skill[] = [
    { name: "venue_router", artifact: "docs/workflow/venue_routing.md", handler: venueRouting },
    { name: "literature_radar", artifact: "docs/workflow/literature_radar.md", handler: literatureRadar },
    { name: "novelty_checker", artifact: "docs/workflow/novelty_check.md", handler: noveltyCheck },
    { name: "scorecard_generator", artifact: "docs/workflow/scorecard.md", handler: scorecard },
    { name: "experiment_designer", artifact: "docs/workflow/experiment_design.md", handler: experimentDesign },
    { name: "reviewer_simulator", artifact: "docs/workflow/reviewer_simulation.md", handler: reviewer },
    { name: "paper_template_generator", artifact: "docs/workflow/paper_skeleton.md", handler: paperSkeleton },
    { name: "rebuttal_assistant", artifact: "docs/workflow/rebuttal_plan.md", handler: rebuttal },
    { name: "weekly_project_manager", artifact: "docs/workflow/weekly_management.md", handler: weekly }
  ];
  return Object.fromEntries(skills.map((skill) => [skill.name, skill]));
}

export function runWorkflow(diagnosis: Diagnosis): Record<string, string> {
  return Object.fromEntries(Object.values(skillRegistry()).map((skill) => [skill.artifact, skill.handler(diagnosis)]));
}

export function workflowSummary(): string {
  const rows = Object.values(skillRegistry()).map((skill) => `| \`${skill.name}\` | \`${skill.artifact}\` |`);
  return `# Workflow

Idea2Repo uses deterministic workflow-first skills. Model-backed skills must preserve these artifact contracts.

| Skill | Artifact |
| --- | --- |
${rows.join("\n")}
`;
}

function venueRouting(diagnosis: Diagnosis): string {
  return `# Venue Routing\n\n${diagnosis.routes.map((route) => `- ${route.domain.label}: score=${route.score}, requested=${route.requested}`).join("\n")}\n`;
}

function literatureRadar(diagnosis: Diagnosis): string {
  const route = diagnosis.routes[0]!;
  return `# Literature Radar

Primary domain: ${route.domain.label}

Start with verified literature only:
- Search recent papers in ${route.domain.primary_venues.slice(0, 3).join(", ")}.
- Fill \`docs/reference/related_work_matrix.csv\`.
- Mark collision risk before claiming novelty.
`;
}

function noveltyCheck(diagnosis: Diagnosis): string {
  return `# Novelty Check

- Raw novelty score: ${diagnosis.raw_score.dimensions.novelty} / 20
- Revised novelty score: ${diagnosis.revised_score.dimensions.novelty} / 20
- Evidence gate: ${submissionReady(diagnosis.evidence_gate) ? "ready" : "blocked"}
- Next check: compare against verified recent related work, not generated prose.
`;
}

function scorecard(diagnosis: Diagnosis): string {
  return `# Scorecard

- Raw score: ${diagnosis.raw_score.total} / 100
- Revised potential score: ${diagnosis.revised_score.total} / 100
- Evidence gate: ${submissionReady(diagnosis.evidence_gate) ? "ready" : "blocked"}

Readiness depends on evidence artifacts, not score alone.
`;
}

function experimentDesign(diagnosis: Diagnosis): string {
  return `# Experiment Design\n\n${diagnosis.required_evidence.map((item) => `- ${item}`).join("\n")}\n`;
}

function reviewer(diagnosis: Diagnosis): string {
  return `# Reviewer Simulation Workflow\n\n${diagnosis.risks.map((risk) => `- Risk: ${risk}`).join("\n")}\n`;
}

function paperSkeleton(diagnosis: Diagnosis): string {
  return `# Paper Skeleton Workflow

- Title candidates stay TODO until related work is verified.
- Contributions must map to \`docs/reference/claim_evidence_matrix.csv\`.
- Security scope: ${diagnosis.security_assessment.scope}
`;
}

function rebuttal(): string {
  return `# Rebuttal Plan

- Paste reviews into this artifact only after submission feedback exists.
- Cluster concerns by novelty, soundness, significance, reproducibility, and ethics.
- Separate text-only responses from responses requiring new evidence.
`;
}

function weekly(diagnosis: Diagnosis): string {
  return `# Weekly Management

- Current week: 1
- Next action: verify related work and baselines.
- Blocking reasons: ${blockingReasons(diagnosis.evidence_gate).join(", ") || "none"}
`;
}
