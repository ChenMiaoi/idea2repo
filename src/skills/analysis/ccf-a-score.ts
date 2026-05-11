export type StrictScoreInput = {
  verifiedRelatedWorkCount?: number;
  pdfReadCount?: number;
  corePaperCount?: number;
  evidenceRefs?: string[];
  hasStrongBaseline?: boolean;
  hasDatasetOrBenchmark?: boolean;
  hasMetric?: boolean;
  highPriorWorkCollision?: boolean;
  pureEngineeringIntegration?: boolean;
  hasScientificHypothesis?: boolean;
  hasExecutableExperimentPlan?: boolean;
  singlePersonTwelveWeekInfeasible?: boolean;
  venueRequiresThreatModel?: boolean;
  hasThreatModel?: boolean;
  venueRequiresSystemEvaluation?: boolean;
  hasPrototype?: boolean;
  venueExpectsStrongMlBaselines?: boolean;
  hasStrongMlBaselines?: boolean;
};

export type ScoreDimension = {
  name: string;
  score: number;
  maxScore: number;
  confidence: number;
  rationale: string;
  positiveEvidence: string[];
  negativeEvidence: string[];
  missingEvidence: string[];
  recommendedActions: string[];
};

export type StrictScoreResult = {
  total: number;
  uncapped_total: number;
  dimensions: Record<string, number>;
  score_dimensions: ScoreDimension[];
  confidence: number;
  caps: Array<{ reason: string; cap: number }>;
  hard_blockers: string[];
  soft_weaknesses: string[];
  path_to_70: string[];
  path_to_80: string[];
};

export function strictCcfAScore(input: StrictScoreInput): StrictScoreResult {
  const scoreDimensions = evidenceBackedDimensions(input);
  const dimensions = legacyDimensions(input);
  const caps: StrictScoreResult["caps"] = [];
  addCap(caps, !input.verifiedRelatedWorkCount, "No verified related work", 50);
  addCap(caps, !input.pdfReadCount, "No PDF read", 45);
  addCap(caps, (input.corePaperCount ?? 0) < 5, "Fewer than 5 core related papers", 60);
  addCap(caps, !input.hasStrongBaseline, "No strong baseline", 65);
  addCap(caps, !input.hasDatasetOrBenchmark, "No dataset/benchmark", 60);
  addCap(caps, !input.hasMetric, "No metric", 60);
  addCap(caps, Boolean(input.highPriorWorkCollision), "High prior-work collision", 55);
  addCap(caps, Boolean(input.pureEngineeringIntegration && !input.hasScientificHypothesis), "Pure engineering integration without scientific hypothesis", 55);
  addCap(caps, !input.hasExecutableExperimentPlan, "No executable experiment plan", 65);
  addCap(caps, Boolean(input.singlePersonTwelveWeekInfeasible), "Single-person/12-week plan is clearly infeasible", 70);
  addCap(caps, Boolean(input.venueRequiresThreatModel && !input.hasThreatModel), "Target venue requires threat model but none exists", 65);
  addCap(caps, Boolean(input.venueRequiresSystemEvaluation && !input.hasPrototype), "Target venue requires system evaluation but prototype absent", 60);
  addCap(caps, Boolean(input.venueExpectsStrongMlBaselines && !input.hasStrongMlBaselines), "Target venue expects strong ML baselines but none defined", 65);
  const uncapped = scoreDimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  const cap = caps.length ? Math.min(...caps.map((item) => item.cap)) : 100;
  const hardBlockers = caps.map((item) => item.reason);
  const softWeaknesses = scoreDimensions
    .filter((dimension) => dimension.score / dimension.maxScore < 0.7)
    .flatMap((dimension) => dimension.missingEvidence)
    .filter((item) => !hardBlockers.includes(item));
  return {
    total: Math.min(uncapped, cap),
    uncapped_total: uncapped,
    dimensions,
    score_dimensions: scoreDimensions,
    confidence: scoreConfidence(input, scoreDimensions),
    caps,
    hard_blockers: hardBlockers,
    soft_weaknesses: [...new Set(softWeaknesses)],
    path_to_70: targetScorePath(70, caps, scoreDimensions),
    path_to_80: targetScorePath(80, caps, scoreDimensions)
  };
}

export function strictScoreMarkdown(result: StrictScoreResult): string {
  return `# CCF-A Strict Scorecard

- Overall CCF-A readiness: ${result.total} / 100
- Uncapped score: ${result.uncapped_total} / 100
- Confidence: ${result.confidence}
- Active cap: ${result.caps.length ? Math.min(...result.caps.map((cap) => cap.cap)) : "none"}

## Evidence-Backed Dimensions

| Dimension | Score | Confidence | Rationale |
| --- | ---: | ---: | --- |
${result.score_dimensions.map((dimension) => `| ${dimension.name} | ${dimension.score}/${dimension.maxScore} | ${dimension.confidence} | ${escapeCell(dimension.rationale)} |`).join("\n")}

## Hard Blockers

${result.hard_blockers.map((blocker, index) => `${index + 1}. ${blocker}`).join("\n") || "- none"}

## Soft Weaknesses

${result.soft_weaknesses.map((weakness) => `- ${weakness}`).join("\n") || "- none"}

## Missing Evidence By Dimension

${result.score_dimensions.map((dimension) => `### ${dimension.name}

- Positive evidence: ${dimension.positiveEvidence.join("; ") || "none"}
- Negative evidence: ${dimension.negativeEvidence.join("; ") || "none"}
- Missing evidence: ${dimension.missingEvidence.join("; ") || "none"}
- Recommended actions: ${dimension.recommendedActions.join("; ") || "none"}`).join("\n\n")}

## Possible Path To 70+

${result.path_to_70.map((action, index) => `${index + 1}. ${action}`).join("\n") || "- Already at or above 70 under current caps."}

## Possible Path To 80+

${result.path_to_80.map((action, index) => `${index + 1}. ${action}`).join("\n") || "- Already at or above 80 under current caps."}

## Cap Rules

${result.caps.map((cap) => `- ${cap.reason}: total cap ${cap.cap}`).join("\n") || "- none"}
`;
}

function addCap(caps: StrictScoreResult["caps"], active: boolean, reason: string, cap: number): void {
  if (active) caps.push({ reason, cap });
}

function evidenceBackedDimensions(input: StrictScoreInput): ScoreDimension[] {
  const evidenceRefs = input.evidenceRefs ?? [];
  const verifiedRelatedWork = input.verifiedRelatedWorkCount ?? 0;
  const pdfRead = input.pdfReadCount ?? 0;
  const corePapers = input.corePaperCount ?? 0;
  return [
    dimension({
      name: "Novelty / Originality",
      maxScore: 20,
      score: input.highPriorWorkCollision ? 6 : verifiedRelatedWork >= 5 && pdfRead >= 5 ? 14 : verifiedRelatedWork > 0 ? 10 : 8,
      confidence: confidenceForEvidence(verifiedRelatedWork, pdfRead, evidenceRefs.length),
      positiveEvidence: verifiedRelatedWork && !input.highPriorWorkCollision ? evidenceRefs.slice(0, 5) : [],
      negativeEvidence: [],
      missingEvidence: [
        ...missingWhen(verifiedRelatedWork < 5, "At least 5 verified core related papers"),
        ...missingWhen(pdfRead < 5, "PDF-backed novelty evidence"),
        ...missingWhen(Boolean(input.highPriorWorkCollision), "Narrow novelty delta against closest prior work")
      ],
      recommendedActions: ["Use page-level evidence to state the exact idea-vs-prior-work delta.", "Remove or narrow any high-collision claim."]
    }),
    dimension({
      name: "Technical Depth",
      maxScore: 15,
      score: input.pureEngineeringIntegration && !input.hasScientificHypothesis ? 6 : input.hasScientificHypothesis ? 12 : 10,
      confidence: input.hasScientificHypothesis ? 0.65 : 0.45,
      positiveEvidence: [],
      negativeEvidence: [],
      missingEvidence: missingWhen(!input.hasScientificHypothesis, "Testable scientific hypothesis"),
      recommendedActions: ["State the mechanism, measurement, or generalization hypothesis that reviewers can falsify."]
    }),
    dimension({
      name: "Problem Significance",
      maxScore: 15,
      score: input.pureEngineeringIntegration ? 9 : 12,
      confidence: evidenceRefs.length ? 0.6 : 0.45,
      positiveEvidence: evidenceRefs.length ? evidenceRefs.slice(0, 3) : [],
      negativeEvidence: [],
      missingEvidence: evidenceRefs.length ? [] : ["Evidence that the target problem matters to the venue community"],
      recommendedActions: ["Tie the problem to recent venue papers, benchmarks, or documented failure modes."]
    }),
    dimension({
      name: "Related Work Differentiation",
      maxScore: 15,
      score: verifiedRelatedWork >= 5 && corePapers >= 5 && pdfRead >= 5 ? 12 : verifiedRelatedWork > 0 || pdfRead > 0 ? 8 : 5,
      confidence: confidenceForEvidence(verifiedRelatedWork, pdfRead, evidenceRefs.length),
      positiveEvidence: verifiedRelatedWork ? evidenceRefs.slice(0, 5) : [],
      negativeEvidence: [],
      missingEvidence: [
        ...missingWhen(verifiedRelatedWork < 5, "Five verified related-work comparisons"),
        ...missingWhen(corePapers < 5, "Core paper set large enough for reviewer expectations"),
        ...missingWhen(pdfRead < 5, "PDF-read evidence for related-work claims")
      ],
      recommendedActions: ["Build a side-by-side related-work matrix with paper, page, quote, and chunk ids."]
    }),
    dimension({
      name: "Evaluation Feasibility",
      maxScore: 15,
      score: 3 + (input.hasStrongBaseline ? 3 : 0) + (input.hasDatasetOrBenchmark ? 3 : 0) + (input.hasMetric ? 3 : 0) + (input.hasExecutableExperimentPlan ? 3 : 0),
      confidence: [input.hasStrongBaseline, input.hasDatasetOrBenchmark, input.hasMetric, input.hasExecutableExperimentPlan].filter(Boolean).length / 5 + 0.2,
      positiveEvidence: evidenceRefs.slice(0, 5),
      negativeEvidence: [],
      missingEvidence: [
        ...missingWhen(!input.hasStrongBaseline, "Strong baseline"),
        ...missingWhen(!input.hasDatasetOrBenchmark, "Concrete dataset or benchmark"),
        ...missingWhen(!input.hasMetric, "Primary success metric"),
        ...missingWhen(!input.hasExecutableExperimentPlan, "Executable experiment plan")
      ],
      recommendedActions: ["Lock the first experiment around one baseline, one dataset, and one primary metric."]
    }),
    dimension({
      name: "Empirical Strength / Reproducibility",
      maxScore: 10,
      score: [input.hasStrongBaseline, input.hasDatasetOrBenchmark, input.hasMetric, Boolean(pdfRead), input.hasExecutableExperimentPlan].filter(Boolean).length * 2,
      confidence: evidenceRefs.length ? 0.65 : 0.35,
      positiveEvidence: evidenceRefs.slice(0, 5),
      negativeEvidence: [],
      missingEvidence: [
        ...missingWhen(!pdfRead, "PDF-backed empirical prior work"),
        ...missingWhen(!input.hasExecutableExperimentPlan, "Reproducible experiment commands or protocol"),
        ...missingWhen(!input.hasStrongBaseline, "Baseline reproduction plan")
      ],
      recommendedActions: ["Add ablations, failure cases, seeds, and artifact paths for reproduction."]
    }),
    dimension({
      name: "Clarity of Claim",
      maxScore: 5,
      score: input.hasScientificHypothesis ? 4 : 3,
      confidence: input.hasScientificHypothesis ? 0.65 : 0.45,
      positiveEvidence: [],
      negativeEvidence: [],
      missingEvidence: missingWhen(!input.hasScientificHypothesis, "Explicit claim tied to method and metric"),
      recommendedActions: ["Rewrite the paper story as a falsifiable claim with one primary contribution."]
    }),
    dimension({
      name: "Ethics / Security / Risk",
      maxScore: 5,
      score: input.venueRequiresThreatModel && !input.hasThreatModel ? 1 : input.venueRequiresSystemEvaluation && !input.hasPrototype ? 2 : 4,
      confidence: input.venueRequiresThreatModel || input.venueRequiresSystemEvaluation ? 0.55 : 0.45,
      positiveEvidence: [],
      negativeEvidence: [],
      missingEvidence: [
        ...missingWhen(Boolean(input.venueRequiresThreatModel && !input.hasThreatModel), "Venue-appropriate threat model"),
        ...missingWhen(Boolean(input.venueRequiresSystemEvaluation && !input.hasPrototype), "System evaluation artifact")
      ],
      recommendedActions: ["Document venue-specific risk, ethics, threat-model, or system-evaluation expectations."]
    })
  ];
}

function dimension(input: Omit<ScoreDimension, "rationale"> & { rationale?: string }): ScoreDimension {
  return {
    ...input,
    rationale: input.rationale ?? rationaleForDimension(input.name, input.score, input.maxScore),
    score: Math.max(0, Math.min(input.maxScore, Math.round(input.score))),
    confidence: clampConfidence(input.confidence),
    positiveEvidence: [...new Set(input.positiveEvidence)],
    negativeEvidence: [...new Set(input.negativeEvidence)],
    missingEvidence: [...new Set(input.missingEvidence)],
    recommendedActions: [...new Set(input.recommendedActions)]
  };
}

function legacyDimensions(input: StrictScoreInput): Record<string, number> {
  return {
    problem_importance: 7,
    novelty_after_related_work: input.highPriorWorkCollision ? 6 : input.verifiedRelatedWorkCount ? 12 : 8,
    technical_depth: input.pureEngineeringIntegration ? 6 : 10,
    experimental_design: input.hasExecutableExperimentPlan ? 10 : 6,
    baseline_dataset_metric: [input.hasStrongBaseline, input.hasDatasetOrBenchmark, input.hasMetric].filter(Boolean).length * 3,
    venue_fit: 7,
    feasibility: input.singlePersonTwelveWeekInfeasible ? 5 : 8,
    reproducibility_open_source_value: 4,
    paper_story: 4
  };
}

function rationaleForDimension(name: string, score: number, maxScore: number): string {
  const percent = maxScore ? score / maxScore : 0;
  if (percent >= 0.8) return `${name} is provisionally strong under the strict evidence-gated rubric.`;
  if (percent >= 0.55) return `${name} is plausible but still needs stronger evidence or sharper framing.`;
  return `${name} is capped by missing evidence, weak claim definition, or unresolved reviewer expectations.`;
}

function targetScorePath(target: 70 | 80, caps: StrictScoreResult["caps"], dimensions: ScoreDimension[]): string[] {
  const capActions = caps
    .filter((cap) => cap.cap < target)
    .map((cap) => actionForMissingEvidence(cap.reason));
  const dimensionActions = [...dimensions]
    .sort((left, right) => (right.maxScore - right.score) - (left.maxScore - left.score))
    .flatMap((dimension) => dimension.recommendedActions)
    .slice(0, target === 70 ? 4 : 6);
  const stretchActions = target === 80
    ? ["Add ablations, robustness checks, and failure analysis tied to the main claim.", "Ensure every positive claim has paper/page/quote/chunk provenance."]
    : [];
  return [...new Set([...capActions, ...dimensionActions, ...stretchActions])].slice(0, target === 70 ? 6 : 8);
}

function scoreConfidence(input: StrictScoreInput, dimensions: ScoreDimension[]): number {
  const evidenceConfidence = confidenceForEvidence(input.verifiedRelatedWorkCount ?? 0, input.pdfReadCount ?? 0, input.evidenceRefs?.length ?? 0);
  const dimensionConfidence = dimensions.reduce((sum, dimension) => sum + dimension.confidence, 0) / Math.max(1, dimensions.length);
  return clampConfidence((evidenceConfidence + dimensionConfidence) / 2);
}

function confidenceForEvidence(verifiedRelatedWork: number, pdfRead: number, evidenceRefs: number): number {
  return clampConfidence(0.3 + Math.min(0.25, verifiedRelatedWork * 0.04) + Math.min(0.25, pdfRead * 0.04) + Math.min(0.15, evidenceRefs * 0.02));
}

function clampConfidence(value: number): number {
  return Math.round(Math.max(0.2, Math.min(0.9, value)) * 100) / 100;
}

function missingWhen(condition: boolean, value: string): string[] {
  return condition ? [value] : [];
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function actionForMissingEvidence(reason: string): string {
  if (/related work|core related papers/i.test(reason)) return "Read and cite enough core related papers with page-level evidence.";
  if (/pdf/i.test(reason)) return "Acquire public PDFs and extract page, quote, and chunk evidence.";
  if (/baseline/i.test(reason)) return "Identify reviewer-expected baselines and link them to evidence.";
  if (/dataset|benchmark/i.test(reason)) return "Define the dataset or benchmark and cite supporting evidence.";
  if (/metric/i.test(reason)) return "Specify primary and secondary metrics with evidence.";
  if (/collision/i.test(reason)) return "Narrow the novelty claim against the closest overlapping papers.";
  if (/hypothesis/i.test(reason)) return "State a falsifiable scientific hypothesis.";
  if (/experiment plan/i.test(reason)) return "Write an executable experiment plan tied to baselines and metrics.";
  if (/threat model/i.test(reason)) return "Write a venue-appropriate threat model.";
  if (/system evaluation|prototype/i.test(reason)) return "Build or scope a prototype with system evaluation metrics.";
  return `Resolve blocker: ${reason}.`;
}
