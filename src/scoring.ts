import { evaluateEvidenceGate, type EvidenceGate } from "./evidence.js";
import type { PaperRecord } from "./literature.js";
import { assessSecurityScope, safeSecurityReframe, type SecurityAssessment } from "./security.js";
import { loadVenueDatabase, routeIdea, type DomainRoute, type VenueDatabase } from "./venues.js";

export const capLimits = {
  unclear_related_work_difference: 60,
  missing_verifiable_experiment_plan: 65,
  engineering_only: 55,
  missing_strong_baseline: 70,
  missing_threat_model: 60,
  missing_system_metrics: 65,
  missing_ai_ablation_or_generalization: 70,
  insufficient_recent_literature: 70,
  non_full_regular_target: 50
} as const;

export type CapTrigger = keyof typeof capLimits;

export type ScoreBreakdown = {
  total: number;
  uncapped_total: number;
  dimensions: Record<string, number>;
  cap_triggers: CapTrigger[];
  cap_limit: number | null;
};

export type ParsedIdea = {
  raw_text: string;
  problem: string;
  motivation: string;
  proposed_method: string;
  expected_contribution: string;
  target_scenario: string;
  evidence_terms: string[];
};

export type Diagnosis = {
  parsed_idea: ParsedIdea;
  routes: DomainRoute[];
  raw_score: ScoreBreakdown;
  revised_score: ScoreBreakdown;
  required_evidence: string[];
  risks: string[];
  revised_plan: string[];
  revised_plan_text: string;
  evidence_gate: EvidenceGate;
  security_assessment: SecurityAssessment;
};

export function parseIdea(idea: string): ParsedIdea {
  const compact = idea.split(/\s+/).filter(Boolean).join(" ");
  return {
    raw_text: idea,
    problem: compact || "TODO: define the research problem.",
    motivation: sentenceOrTodo(compact, ["because", "motivat", "need", "problem", "bottleneck"], "TODO: explain why the target community should care."),
    proposed_method: sentenceOrTodo(compact, ["method", "approach", "system", "model", "algorithm", "framework"], "TODO: describe the proposed method or system."),
    expected_contribution: sentenceOrTodo(compact, ["contribution", "novel", "new", "improve", "reduce", "detect"], "TODO: state the expected scientific contribution."),
    target_scenario: sentenceOrTodo(compact, ["agent", "security", "system", "runtime", "llm", "database"], "TODO: identify the concrete target user, workload, or scenario."),
    evidence_terms: matchedTerms(compact, [
      "benchmark",
      "baseline",
      "dataset",
      "metric",
      "ablation",
      "scalability",
      "latency",
      "throughput",
      "threat model",
      "privacy",
      "security",
      "novel",
      "new",
      "compare",
      "evaluation",
      "experiment"
    ])
  };
}

export function diagnoseIdea(
  idea: string,
  options: {
    requestedDomains?: string[];
    database?: VenueDatabase;
    verifiedPapers?: PaperRecord[];
    baselines?: string[];
    datasets?: string[];
    metrics?: string[];
    claimEvidenceRows?: Array<Record<string, unknown>>;
  } = {}
): Diagnosis {
  const database = options.database ?? loadVenueDatabase();
  const securityAssessment = assessSecurityScope(idea);
  const scopedIdea = safeSecurityReframe(idea, securityAssessment);
  const parsed = parseIdea(scopedIdea);
  const routes = routeIdea(scopedIdea, database, options.requestedDomains);
  const primary = routes[0]?.domain ?? database.domains.ai_llm_agent!;
  const requiredEvidence = requiredEvidenceFor(primary.key);
  const revisedPlan = revisedPlanFor(primary.key);
  const revisedPlanText = buildRevisedPlanText(parsed, primary.key, requiredEvidence, revisedPlan);
  const raw = score(parsed, routes[0]!);
  const revised = score(parseIdea(revisedPlanText), routes[0]!);
  return {
    parsed_idea: parsed,
    routes,
    raw_score: raw,
    revised_score: revised,
    required_evidence: requiredEvidence,
    risks: risksFor(primary.key, raw.cap_triggers),
    revised_plan: revisedPlan,
    revised_plan_text: revisedPlanText,
    evidence_gate: evaluateEvidenceGate(options.verifiedPapers ?? [], {
      baselines: options.baselines,
      datasets: options.datasets,
      metrics: options.metrics,
      claimEvidenceRows: options.claimEvidenceRows
    }),
    security_assessment: securityAssessment
  };
}

function score(parsed: ParsedIdea, route: DomainRoute): ScoreBreakdown {
  const idea = parsed.raw_text.toLocaleLowerCase();
  const dimensions: Record<string, number> = {
    problem_importance: bounded(4 + Math.floor(route.score / 15) + hasAny(idea, "real", "important", "bottleneck"), 10),
    novelty: bounded(5 + hasAny(idea, "novel", "new", "gap", "different") * 4 + Math.floor(route.score / 20), 20),
    technical_depth: bounded(4 + hasAny(idea, "algorithm", "system", "theory", "prototype", "method") * 4, 15),
    venue_fit: bounded(3 + Math.min(Math.floor(route.score / 10), 7), 10),
    experimental_verifiability: bounded(3 + hasAny(idea, "experiment", "evaluation", "benchmark", "metric") * 4, 15),
    baseline_dataset_metric: bounded(2 + hasAny(idea, "baseline", "dataset", "metric") * 3, 10),
    feasibility: bounded(5 + hasAny(idea, "12 week", "resource", "gpu", "prototype") * 2, 10),
    engineering_open_source_value: bounded(2 + hasAny(idea, "repo", "open source", "benchmark", "tool") * 2, 5),
    paper_story: bounded(3 + hasAny(idea, "claim", "contribution", "story") * 2, 5)
  };
  const triggers = capTriggers(idea, route.domain.key);
  const uncapped = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
  const cap = triggers.length ? Math.min(...triggers.map((trigger) => capLimits[trigger])) : null;
  return {
    total: cap == null ? uncapped : Math.min(uncapped, cap),
    uncapped_total: uncapped,
    dimensions,
    cap_triggers: triggers,
    cap_limit: cap
  };
}

function capTriggers(idea: string, domain: string): CapTrigger[] {
  const triggers: CapTrigger[] = [];
  if (!hasAny(idea, "related work", "prior work", "different", "novel", "gap")) triggers.push("unclear_related_work_difference");
  if (!hasAny(idea, "experiment", "evaluation", "benchmark", "metric", "dataset")) triggers.push("missing_verifiable_experiment_plan");
  if (hasAny(idea, "platform", "tool", "repo", "dashboard") && !hasAny(idea, "hypothesis", "claim", "novel", "new")) triggers.push("engineering_only");
  if (!hasAny(idea, "baseline", "sota", "compare", "comparison")) triggers.push("missing_strong_baseline");
  if (domain === "security" && !hasAny(idea, "threat model", "attacker", "defender")) triggers.push("missing_threat_model");
  if (domain === "systems" && !hasAny(idea, "latency", "throughput", "memory", "scalability", "cost")) triggers.push("missing_system_metrics");
  if (domain === "ai_llm_agent" && !hasAny(idea, "ablation", "generalization", "ood", "failure case")) triggers.push("missing_ai_ablation_or_generalization");
  if (!hasAny(idea, "2024", "2025", "2026", "recent", "last two years")) triggers.push("insufficient_recent_literature");
  if (hasAny(idea, "workshop", "short paper", "short-paper", "demo paper", "demo track")) triggers.push("non_full_regular_target");
  return triggers;
}

function requiredEvidenceFor(domain: string): string[] {
  const common = [
    "A traceable related-work matrix with real papers, links, and BibTeX.",
    "A strong-baseline list with datasets, metrics, and reproduction order.",
    "A claim-evidence matrix that maps every paper claim to planned evidence."
  ];
  if (domain === "security") {
    return [...common, "A threat model with attacker and defender capabilities.", "False-positive and false-negative analysis on owned or synthetic data."];
  }
  if (domain === "systems") {
    return [...common, "End-to-end throughput, latency, memory, scalability, and cost measurements.", "Microbenchmark and ablation results explaining system-design necessity."];
  }
  return [...common, "Ablation, generalization, and failure-case analysis for the proposed agent method."];
}

function revisedPlanFor(domain: string): string[] {
  if (domain === "security") return ["Reframe the idea as defensive evaluation or mitigation.", "Write the threat model before any experiment.", "Use synthetic, owned, or public benchmark data only.", "Prioritize reproducible detection and measurement artifacts."];
  if (domain === "systems") return ["Narrow the core system bottleneck and workload.", "Build a minimal prototype before paper writing.", "Define latency, throughput, memory, scalability, and cost metrics.", "Compare with strong system baselines and ablations."];
  return ["Clarify the agent-specific problem formulation.", "Verify recent related-work collisions before claiming novelty.", "Define baselines, datasets, metrics, ablations, and failure cases.", "Scope the project to a reproducible benchmark-first contribution."];
}

function risksFor(domain: string, triggers: CapTrigger[]): string[] {
  return [
    ...triggers.map((trigger) => `Score capped by ${trigger}.`),
    ...(domain === "security" ? ["Security scope must remain defensive and benchmark-oriented."] : []),
    ...(domain === "systems" ? ["System claims need performance evidence, not architecture prose alone."] : []),
    ...(domain === "ai_llm_agent" ? ["Agent claims need ablations and long-horizon benchmark evidence."] : [])
  ];
}

function buildRevisedPlanText(parsed: ParsedIdea, domain: string, evidence: string[], plan: string[]): string {
  return [
    `Research problem: ${parsed.problem}`,
    `Target domain: ${domain}`,
    "Revised plan:",
    ...plan.map((item) => `- ${item}`),
    "Required evidence:",
    ...evidence.map((item) => `- ${item}`),
    "The project must compare against strong baselines, use verified recent related work from 2024 2025 2026, include experiment benchmark dataset metric evidence, and document ablation generalization failure case analysis."
  ].join("\n");
}

function sentenceOrTodo(text: string, markers: string[], fallback: string): string {
  if (!text) return fallback;
  const sentence = text.split(/[.!?。！？]/).find((part) => markers.some((marker) => part.toLocaleLowerCase().includes(marker)));
  return sentence?.trim() || fallback;
}

function matchedTerms(text: string, terms: string[]): string[] {
  const lowered = text.toLocaleLowerCase();
  return terms.filter((term) => lowered.includes(term));
}

function hasAny(text: string, ...needles: string[]): number {
  return needles.some((needle) => text.includes(needle)) ? 1 : 0;
}

function bounded(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}
