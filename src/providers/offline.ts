import { diagnoseIdea } from "../scoring.js";
import { OFFLINE_PROVIDER_ID, apiShapeForProvider } from "../providers.js";
import type { ResearchAnalysis } from "../types.js";
import type { ProviderAdapter, StructuredRequest } from "./adapter.js";

export class OfflineAdapter implements ProviderAdapter {
  readonly id = OFFLINE_PROVIDER_ID;

  async available(): Promise<boolean> {
    return true;
  }

  async status(): Promise<Record<string, unknown>> {
    return {
      id: this.id,
      available: true,
      api_shape: apiShapeForProvider(this.id),
      capabilities: ["deterministic_research_analysis"],
      auth_boundary: "No external credentials or network calls are used."
    };
  }

  async structured<T>(request: StructuredRequest<T>): Promise<T> {
    const context = request.context as { idea?: string; requestedDomains?: string[]; timelineWeeks?: number; resources?: string[]; stack?: "python" | "ts" };
    if (request.schemaName !== "ResearchAnalysis" || !context.idea) {
      throw new Error(`offline adapter cannot satisfy structured schema: ${request.schemaName}`);
    }
    request.progress?.("Analysis: offline deterministic fallback");
    return request.validate(offlineResearchAnalysis(context.idea, context)) as T;
  }
}

export function offlineResearchAnalysis(
  idea: string,
  options: { requestedDomains?: string[]; timelineWeeks?: number; resources?: string[]; stack?: "python" | "ts" } = {}
): ResearchAnalysis {
  const diagnosis = diagnoseIdea(idea, { requestedDomains: options.requestedDomains });
  const route = diagnosis.routes[0]!;
  const lower = idea.toLowerCase();
  const hasBaseline = lower.includes("baseline");
  const hasDataset = lower.includes("dataset") || lower.includes("benchmark");
  const hasMetric = lower.includes("metric") || lower.includes("accuracy") || lower.includes("latency");
  return {
    schema_version: 1,
    idea_summary: compactSentence(idea),
    problem_statement: diagnosis.parsed_idea.problem,
    domain_route: {
      key: route.domain.key,
      label: route.domain.label,
      candidate_venues: route.domain.primary_venues,
      rationale: route.requested
        ? `Requested venue/domain matched ${route.domain.label}.`
        : `Matched ${route.matched_keywords.length} domain keywords for ${route.domain.label}.`
    },
    raw_score: {
      total: diagnosis.raw_score.total,
      rationale: scoreRationale(diagnosis.raw_score),
      cap_reasons: diagnosis.raw_score.cap_triggers
    },
    revised_score: {
      total: diagnosis.revised_score.total,
      rationale: scoreRationale(diagnosis.revised_score),
      cap_reasons: diagnosis.revised_score.cap_triggers
    },
    feasibility: `Offline assessment assumes ${options.timelineWeeks ?? 12} weeks with ${options.resources?.length ? options.resources.join(", ") : "unspecified resources"}.`,
    risks: diagnosis.risks,
    related_work_queries: [
      `${route.domain.label} ${compactSentence(idea)} baseline`,
      `${compactSentence(idea)} dataset metric`,
      `${compactSentence(idea)} recent related work`
    ],
    paper_clusters: [],
    novelty_gaps: ["Novelty requires verified related work before making publication claims."],
    revised_plan: {
      summary: `Strengthen the idea for ${route.domain.label} with verified prior work, baselines, datasets, metrics, and ablations.`,
      key_changes: ["Add traceable related work.", "Lock baselines and datasets before implementation.", "Tie every paper claim to evidence artifacts."],
      evidence_required: ["Related-work matrix", "Baseline reproduction", "Dataset and metric justification", "Ablation and failure analysis"],
      feasibility: "Feasible only after scope is reduced to evidence-backed experiments."
    },
    experiment_plan: {
      baselines: hasBaseline ? ["Use named baselines from verified related work."] : ["TODO: identify baselines from literature search."],
      datasets: hasDataset ? ["Use benchmark datasets after license and access checks."] : ["TODO: identify datasets from literature search."],
      metrics: hasMetric ? ["Use metrics aligned with reviewer expectations."] : ["TODO: identify metrics from literature search."],
      ablations: ["Remove one method component at a time."],
      failure_cases: ["Collect cases where the method underperforms strong baselines."],
      reproducibility_checks: ["Document commands, seeds, environment, and artifact hashes."]
    },
    timeline: [
      { week: 1, deliverable: "Verified related-work matrix", exit_criteria: "At least 8 core candidates and source URLs." },
      { week: 2, deliverable: "Baseline and dataset lock", exit_criteria: "Commands and metrics documented." }
    ],
    reviewer_simulation: "A strict reviewer would ask for verified novelty, strong baselines, and executable evidence before accepting the plan."
  };
}

function compactSentence(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 240) || "Untitled research idea";
}

function scoreRationale(score: { total: number; uncapped_total: number; cap_triggers: string[]; cap_limit: number | null }): string {
  const cap = score.cap_limit == null ? "no cap applied" : `capped at ${score.cap_limit} by ${score.cap_triggers.join(", ")}`;
  return `Deterministic rubric score ${score.total}/${score.uncapped_total}; ${cap}.`;
}
