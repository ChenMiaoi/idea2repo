import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readResearchPipelineState, writeResearchPipelineState } from "../pipeline/stage-state.js";
import { strictCcfAScore, type StrictScoreInput, type StrictScoreResult } from "../skills/analysis/ccf-a-score.js";
import type { NoveltyAssessment, NoveltyDimensionName } from "../skills/analysis/novelty-matrix.js";
import { appendScoreSnapshot, scoreSnapshotFromStrictScore, type ScoreSnapshot } from "./ledgers.js";
import { runtimeTimestamp, type EventSink } from "./events.js";
import { readRunState, writeRunState, type PersistedRunState } from "./run-state.js";

export const CLARIFICATION_QUESTIONS_LEDGER_PATH = join(".idea2repo", "questions.jsonl");
export const CLARIFICATION_STAGE_ID = "clarification_dialogue";
export const MAX_ACTIVE_CLARIFICATION_QUESTIONS = 3;

export type ClarificationQuestionStatus = "active" | "answered" | "dismissed";

export type ClarificationTopic =
  | "related_work"
  | "pdf_evidence"
  | "baseline"
  | "dataset"
  | "metric"
  | "novelty"
  | "experiment"
  | "hypothesis"
  | "threat_model"
  | "system_evaluation"
  | "ml_baseline";

export type ClarificationQuestion = {
  id: string;
  run_id: string;
  stage_id: typeof CLARIFICATION_STAGE_ID;
  topic: ClarificationTopic;
  scoreInput: StrictScoreInput;
  question: string;
  whyItMatters: string;
  relatedScoreDimensions: string[];
  evidenceRefs: string[];
  options?: string[];
  required: boolean;
  status: ClarificationQuestionStatus;
  created_at: string;
  updated_at: string;
  answered_at?: string;
  answer?: string;
  answer_effect?: ClarificationAnswerEffect;
};

export type IdeaProfilePatch = {
  field: string;
  value: string;
  updated_idea: string;
  assumptions: string[];
};

export type ClarificationRunProfileAnswer = {
  question_id: string;
  question: string;
  topic: ClarificationTopic;
  field: string;
  answer: string;
  score_snapshot_id: string;
  resolved_blockers: string[];
  remaining_blockers: string[];
  answered_at: string;
};

export type ClarificationRunProfile = {
  original_idea: string;
  updated_idea: string;
  assumptions: string[];
  answers: ClarificationRunProfileAnswer[];
  score_snapshot_ids: string[];
  updated_at: string;
};

export type ClarificationAnswerEffect = {
  profile_patch: IdeaProfilePatch;
  refreshed_score_snapshot_id: string;
  resolved_blockers: string[];
  remaining_blockers: string[];
};

export type ClarificationAnswerResult = {
  question: ClarificationQuestion;
  profile: ClarificationRunProfile;
  score_input: StrictScoreInput;
  score: StrictScoreResult;
  score_snapshot: ScoreSnapshot;
};

const dialogueWriteQueues = new Map<string, Promise<void>>();

export async function ensureClarificationQuestionsLedger(root: string): Promise<void> {
  await queueWrite(ledgerPath(root), async () => {
    try {
      await readFile(ledgerPath(root), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await writeJsonlFile(ledgerPath(root), []);
    }
  });
}

export async function readClarificationQuestions(root: string): Promise<ClarificationQuestion[]> {
  const path = ledgerPath(root);
  await dialogueWriteQueues.get(path)?.catch(() => undefined);
  return await readJsonlFile<ClarificationQuestion>(path);
}

export async function currentClarificationQuestions(root: string, runId?: string): Promise<ClarificationQuestion[]> {
  return latestQuestions((await readClarificationQuestions(root)).filter((question) => !runId || question.run_id === runId));
}

export async function activeClarificationQuestions(root: string, runId?: string): Promise<ClarificationQuestion[]> {
  return (await currentClarificationQuestions(root, runId)).filter((question) => question.status === "active");
}

export async function recordClarificationQuestions(
  root: string,
  questions: ClarificationQuestion[],
  options: { runId?: string; maxActive?: number } = {}
): Promise<string> {
  const path = ledgerPath(root);
  await queueWrite(path, async () => {
    await mkdir(dirname(path), { recursive: true });
    const existing = await readJsonlFile<ClarificationQuestion>(path);
    const current = latestQuestions(existing);
    const runId = options.runId ?? questions[0]?.run_id;
    const maxActive = options.maxActive ?? MAX_ACTIVE_CLARIFICATION_QUESTIONS;
    const activeCount = current.filter((question) => question.run_id === runId && question.status === "active").length;
    const seenIds = new Set(current.filter((question) => question.run_id === runId).map((question) => question.id));
    const accepted: ClarificationQuestion[] = [];
    for (const question of questions) {
      if (runId && question.run_id !== runId) continue;
      if (seenIds.has(question.id)) continue;
      if (activeCount + accepted.length >= maxActive) break;
      accepted.push(question);
      seenIds.add(question.id);
    }
    if (accepted.length) await appendFile(path, accepted.map((question) => JSON.stringify(question)).join("\n") + "\n", "utf8");
  });
  return path;
}

export function generateClarificationQuestions(input: {
  runId: string;
  idea: string;
  score: StrictScoreResult;
  novelty: NoveltyAssessment;
  scoreInput?: StrictScoreInput;
  evidenceRefs?: string[];
  existing?: ClarificationQuestion[];
  timestamp?: string;
  maxActive?: number;
}): ClarificationQuestion[] {
  const timestamp = input.timestamp ?? runtimeTimestamp();
  const maxActive = input.maxActive ?? MAX_ACTIVE_CLARIFICATION_QUESTIONS;
  const existingCurrent = latestQuestions(input.existing ?? []).filter((question) => question.run_id === input.runId);
  const activeCount = existingCurrent.filter((question) => question.status === "active").length;
  if (activeCount >= maxActive) return [];
  const existingIds = new Set(existingCurrent.map((question) => question.id));
  const refs = input.evidenceRefs ?? noveltyEvidenceRefs(input.novelty);
  const scoreInput = input.scoreInput ?? scoreInputFromScoreCaps(input.score);
  const candidates = candidateQuestions({ runId: input.runId, idea: input.idea, score: input.score, scoreInput, novelty: input.novelty, timestamp }, refs);
  const result: ClarificationQuestion[] = [];
  for (const question of candidates) {
    if (existingIds.has(question.id)) continue;
    result.push(question);
    if (activeCount + result.length >= maxActive) break;
  }
  return result;
}

export async function answerClarificationQuestion(
  root: string,
  input: {
    runId: string;
    questionId: string;
    answer: string;
    idea?: string;
    baseScoreInput?: StrictScoreInput;
    evidenceRefs?: string[];
    timestamp?: string;
    events?: EventSink;
  }
): Promise<ClarificationAnswerResult> {
  const answer = input.answer.trim();
  if (!answer) throw new Error("answer must not be empty");
  const path = ledgerPath(root);
  const timestamp = input.timestamp ?? runtimeTimestamp();
  let result: ClarificationAnswerResult | null = null;
  await queueWrite(path, async () => {
    await mkdir(dirname(path), { recursive: true });
    const current = latestQuestions(await readJsonlFile<ClarificationQuestion>(path));
    const question = current.find((candidate) => candidate.run_id === input.runId && candidate.id === input.questionId);
    if (!question) throw new Error(`clarification question not found: ${input.questionId}`);
    if (question.status !== "active") throw new Error(`clarification question is not active: ${input.questionId}`);
    const persisted = await readPersistedProfileContext(root, input.runId);
    const baseScoreInput = question.scoreInput ?? input.baseScoreInput ?? {};
    const refreshedScoreInput = applyClarificationAnswerToScoreInput(baseScoreInput, question, answer);
    const previous = strictCcfAScore(baseScoreInput);
    const refreshed = strictCcfAScore(refreshedScoreInput);
    const snapshot = scoreSnapshotFromStrictScore({
      runId: input.runId,
      stageId: CLARIFICATION_STAGE_ID,
      score: refreshed,
      evidenceRefs: input.evidenceRefs ?? question.evidenceRefs,
      timestamp
    });
    await appendScoreSnapshot(root, snapshot);
    const profilePatch = applyClarificationAnswerToIdeaProfile(persisted.profile?.updated_idea ?? persisted.runState?.idea ?? persisted.pipelineState?.idea ?? input.idea ?? "", question, answer);
    const effect: ClarificationAnswerEffect = {
      profile_patch: profilePatch,
      refreshed_score_snapshot_id: snapshot.id,
      resolved_blockers: previous.caps.map((cap) => cap.reason).filter((reason) => !refreshed.caps.some((cap) => cap.reason === reason)),
      remaining_blockers: refreshed.caps.map((cap) => cap.reason)
    };
    const answered: ClarificationQuestion = {
      ...question,
      status: "answered",
      answer,
      answer_effect: effect,
      answered_at: timestamp,
      updated_at: timestamp
    };
    await appendFile(path, JSON.stringify(answered) + "\n", "utf8");
    const profile = await persistClarificationProfile(root, {
      runId: input.runId,
      question: answered,
      patch: profilePatch,
      previousProfile: persisted.profile,
      scoreSnapshotId: snapshot.id,
      resolvedBlockers: effect.resolved_blockers,
      remainingBlockers: effect.remaining_blockers,
      timestamp
    });
    result = { question: answered, profile, score_input: refreshedScoreInput, score: refreshed, score_snapshot: snapshot };
  });
  const finalResult = result as ClarificationAnswerResult | null;
  if (!finalResult) throw new Error("clarification answer was not recorded");
  await input.events?.emit({
    type: "score.updated",
    run_id: input.runId,
    stage_id: CLARIFICATION_STAGE_ID,
    score: finalResult.score.total,
    max_score: 100,
    confidence: finalResult.score.confidence,
    hard_blockers: finalResult.score.caps.map((cap) => cap.reason),
    timestamp
  });
  return finalResult;
}

export function applyClarificationAnswerToScoreInput(input: StrictScoreInput, question: ClarificationQuestion, answer: string): StrictScoreInput {
  const normalizedAnswer = answer.toLowerCase();
  const next: StrictScoreInput = { ...input };
  switch (question.topic) {
    case "related_work":
      next.verifiedRelatedWorkCount = Math.max(input.verifiedRelatedWorkCount ?? 0, 5);
      next.corePaperCount = Math.max(input.corePaperCount ?? 0, 5);
      break;
    case "pdf_evidence":
      next.pdfReadCount = Math.max(input.pdfReadCount ?? 0, 5);
      break;
    case "baseline":
      next.hasStrongBaseline = true;
      next.hasStrongMlBaselines = true;
      break;
    case "dataset":
      next.hasDatasetOrBenchmark = true;
      break;
    case "metric":
      next.hasMetric = true;
      break;
    case "novelty":
      next.highPriorWorkCollision = /same|identical|already|no delta/.test(normalizedAnswer) ? input.highPriorWorkCollision : false;
      next.hasScientificHypothesis = true;
      break;
    case "experiment":
      next.hasExecutableExperimentPlan = true;
      next.hasScientificHypothesis = true;
      break;
    case "hypothesis":
      next.hasScientificHypothesis = true;
      next.pureEngineeringIntegration = false;
      break;
    case "threat_model":
      next.hasThreatModel = true;
      break;
    case "system_evaluation":
      next.hasPrototype = true;
      break;
    case "ml_baseline":
      next.hasStrongMlBaselines = true;
      next.hasStrongBaseline = true;
      break;
  }
  return next;
}

export function applyClarificationAnswerToIdeaProfile(idea: string, question: ClarificationQuestion, answer: string): IdeaProfilePatch {
  const field = fieldForTopic(question.topic);
  const trimmed = answer.trim();
  const base = idea.trim();
  return {
    field,
    value: trimmed,
    updated_idea: base ? `${base}\n\nClarification (${field}): ${trimmed}` : `Clarification (${field}): ${trimmed}`,
    assumptions: [`${field}: ${trimmed}`]
  };
}

export function clarificationQuestionsMarkdown(questions: ClarificationQuestion[]): string {
  return `# Clarification Questions

${questions.length ? questions.map((question, index) => `## ${index + 1}. ${question.question}

- Status: ${question.status}
- Required: ${question.required ? "yes" : "no"}
- Why it matters: ${question.whyItMatters}
- Related score dimensions: ${question.relatedScoreDimensions.join(", ") || "none"}
- Evidence refs: ${question.evidenceRefs.join(", ") || "none"}
- Options: ${question.options?.join("; ") ?? "free-form"}
${question.answer ? `- Answer: ${question.answer}` : ""}`).join("\n\n") : "No clarification questions are currently active."}
`;
}

function candidateQuestions(
  input: { runId: string; idea: string; score: StrictScoreResult; scoreInput: StrictScoreInput; novelty: NoveltyAssessment; timestamp: string },
  evidenceRefs: string[]
): ClarificationQuestion[] {
  const caps = new Set(input.score.caps.map((cap) => cap.reason));
  const timestamp = input.timestamp;
  const candidates: ClarificationQuestion[] = [];
  const add = (topic: ClarificationTopic, question: Omit<ClarificationQuestion, "id" | "run_id" | "stage_id" | "topic" | "scoreInput" | "status" | "created_at" | "updated_at">): void => {
    candidates.push({
      id: questionId(input.runId, topic),
      run_id: input.runId,
      stage_id: CLARIFICATION_STAGE_ID,
      topic,
      scoreInput: input.scoreInput,
      status: "active",
      created_at: timestamp,
      updated_at: timestamp,
      ...question
    });
  };

  if (caps.has("No verified related work") || caps.has("Fewer than 5 core related papers")) {
    add("related_work", {
      question: "Which five papers should anchor the closest related-work comparison?",
      whyItMatters: "The CCF-A score is capped until the claim is compared against enough verified core papers.",
      relatedScoreDimensions: ["novelty_after_related_work", "paper_story"],
      evidenceRefs,
      options: ["Use current top candidates", "Prioritize target-venue papers", "Add missing direct baselines"],
      required: true
    });
  }
  if (caps.has("No PDF read")) {
    add("pdf_evidence", {
      question: "Which public PDFs should be read first for page-level evidence?",
      whyItMatters: "Novelty and score rationale cannot move past the PDF evidence cap without page, quote, and chunk references.",
      relatedScoreDimensions: ["novelty_after_related_work", "reproducibility_open_source_value"],
      evidenceRefs,
      options: ["Read all available PDFs", "Read top CCF-A candidates", "Read baseline/dataset papers first"],
      required: true
    });
  }
  if (caps.has("High prior-work collision") || weakNoveltyDimensions(input.novelty).length > 0) {
    add("novelty", {
      question: `Which novelty axis should be defended most tightly: ${weakNoveltyDimensions(input.novelty).join(", ") || "problem, method, data, metric, evaluation, or contribution"}?`,
      whyItMatters: "The related-work score stays capped until the paper claims a narrow delta against the closest prior work.",
      relatedScoreDimensions: ["novelty_after_related_work", "technical_depth", "paper_story"],
      evidenceRefs: noveltyEvidenceRefs(input.novelty, evidenceRefs),
      options: ["New method", "New benchmark/data", "New evaluation or measurement finding"],
      required: true
    });
  }
  if (caps.has("No strong baseline")) {
    add("baseline", {
      question: "What is the strongest reviewer-expected baseline for the first experiment?",
      whyItMatters: "The rubric caps the score when the evaluation lacks a credible baseline comparison.",
      relatedScoreDimensions: ["baseline_dataset_metric", "experimental_design"],
      evidenceRefs,
      options: ["Published SOTA baseline", "Ablated version of our method", "Strong open-source system baseline"],
      required: true
    });
  }
  if (caps.has("No dataset/benchmark")) {
    add("dataset", {
      question: "Which dataset or benchmark is the primary evaluation target?",
      whyItMatters: "The CCF-A readiness score is capped until the evaluation target is concrete enough to reproduce.",
      relatedScoreDimensions: ["baseline_dataset_metric", "experimental_design"],
      evidenceRefs,
      options: ["Existing public benchmark", "New curated dataset", "Synthetic/workload benchmark"],
      required: true
    });
  }
  if (caps.has("No metric")) {
    add("metric", {
      question: "Which primary metric should decide whether the idea succeeds?",
      whyItMatters: "The score cannot clear the metric cap until the paper names a reviewer-legible success measure.",
      relatedScoreDimensions: ["baseline_dataset_metric", "experimental_design"],
      evidenceRefs,
      options: ["Quality/accuracy", "Latency/cost", "Robustness/failure rate"],
      required: true
    });
  }
  if (caps.has("No executable experiment plan")) {
    add("experiment", {
      question: "What is the smallest executable experiment that tests the main claim?",
      whyItMatters: "The plan must tie hypothesis, baseline, dataset, and metric together before feasibility can be trusted.",
      relatedScoreDimensions: ["experimental_design", "feasibility", "paper_story"],
      evidenceRefs,
      options: ["Offline benchmark run", "Ablation study", "User or system evaluation"],
      required: true
    });
  }
  if (caps.has("Pure engineering integration without scientific hypothesis")) {
    add("hypothesis", {
      question: "What scientific hypothesis distinguishes this from an engineering integration?",
      whyItMatters: "The rubric caps integration-only ideas unless the paper states a testable research claim.",
      relatedScoreDimensions: ["technical_depth", "paper_story"],
      evidenceRefs,
      options: ["Mechanism claim", "Measurement claim", "Generalization claim"],
      required: true
    });
  }
  if (caps.has("Target venue requires threat model but none exists")) {
    add("threat_model", {
      question: "What threat model or attacker capability should the paper assume?",
      whyItMatters: "Security venues expect an explicit threat model before judging evaluation soundness.",
      relatedScoreDimensions: ["venue_fit", "experimental_design"],
      evidenceRefs,
      options: ["Black-box attacker", "White-box attacker", "Operational misuse/failure model"],
      required: true
    });
  }
  if (caps.has("Target venue requires system evaluation but prototype absent")) {
    add("system_evaluation", {
      question: "What prototype or system slice can be evaluated within the run?",
      whyItMatters: "Systems venues cap readiness when claims lack a concrete implementation target.",
      relatedScoreDimensions: ["venue_fit", "feasibility", "reproducibility_open_source_value"],
      evidenceRefs,
      options: ["Minimal prototype", "Trace-driven simulator", "Open-source extension"],
      required: true
    });
  }
  if (caps.has("Target venue expects strong ML baselines but none defined")) {
    add("ml_baseline", {
      question: "Which strong ML baselines should be included for the target venue?",
      whyItMatters: "ML venues expect comparisons against current strong baselines, not only simple ablations.",
      relatedScoreDimensions: ["venue_fit", "baseline_dataset_metric"],
      evidenceRefs,
      options: ["Published SOTA model", "Strong open-source model", "Task-specific supervised baseline"],
      required: true
    });
  }
  return candidates;
}

function latestQuestions(records: ClarificationQuestion[]): ClarificationQuestion[] {
  const byId = new Map<string, ClarificationQuestion>();
  for (const record of records) byId.set(record.id, record);
  return [...byId.values()].sort((left, right) => left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

function weakNoveltyDimensions(novelty: NoveltyAssessment): NoveltyDimensionName[] {
  return novelty.dimension_deltas
    .filter((dimension) => dimension.status === "weak" || dimension.status === "missing" || dimension.status === "blocked" || dimension.risk === "high")
    .map((dimension) => dimension.dimension);
}

function noveltyEvidenceRefs(novelty: NoveltyAssessment, fallback: string[] = []): string[] {
  const refs = novelty.evidence_refs.map((ref) => `${ref.paper_id}:p${ref.page}:${ref.chunk_id}`);
  for (const dimension of novelty.dimension_deltas) {
    for (const ref of dimension.evidence_refs) refs.push(`${ref.paper_id}:p${ref.page}:${ref.chunk_id}`);
  }
  return [...new Set(refs.length ? refs : fallback)].slice(0, 8);
}

function fieldForTopic(topic: ClarificationTopic): string {
  const fields: Record<ClarificationTopic, string> = {
    related_work: "core related work",
    pdf_evidence: "PDF evidence priority",
    baseline: "baseline",
    dataset: "dataset or benchmark",
    metric: "metric",
    novelty: "novelty axis",
    experiment: "experiment plan",
    hypothesis: "scientific hypothesis",
    threat_model: "threat model",
    system_evaluation: "system evaluation",
    ml_baseline: "ML baseline"
  };
  return fields[topic];
}

function scoreInputFromScoreCaps(score: StrictScoreResult): StrictScoreInput {
  const caps = new Set(score.caps.map((cap) => cap.reason));
  return {
    verifiedRelatedWorkCount: caps.has("No verified related work") ? 0 : 5,
    pdfReadCount: caps.has("No PDF read") ? 0 : 5,
    corePaperCount: caps.has("Fewer than 5 core related papers") ? 0 : 5,
    hasStrongBaseline: !caps.has("No strong baseline"),
    hasDatasetOrBenchmark: !caps.has("No dataset/benchmark"),
    hasMetric: !caps.has("No metric"),
    highPriorWorkCollision: caps.has("High prior-work collision"),
    pureEngineeringIntegration: caps.has("Pure engineering integration without scientific hypothesis"),
    hasScientificHypothesis: !caps.has("Pure engineering integration without scientific hypothesis"),
    hasExecutableExperimentPlan: !caps.has("No executable experiment plan"),
    singlePersonTwelveWeekInfeasible: caps.has("Single-person/12-week plan is clearly infeasible"),
    venueRequiresThreatModel: caps.has("Target venue requires threat model but none exists"),
    hasThreatModel: !caps.has("Target venue requires threat model but none exists"),
    venueRequiresSystemEvaluation: caps.has("Target venue requires system evaluation but prototype absent"),
    hasPrototype: !caps.has("Target venue requires system evaluation but prototype absent"),
    venueExpectsStrongMlBaselines: caps.has("Target venue expects strong ML baselines but none defined"),
    hasStrongMlBaselines: !caps.has("Target venue expects strong ML baselines but none defined")
  };
}

async function readPersistedProfileContext(root: string, runId: string): Promise<{
  runState?: PersistedRunState;
  pipelineState?: Awaited<ReturnType<typeof readResearchPipelineState>>;
  profile?: ClarificationRunProfile;
}> {
  const runState = await readRunState(root).catch(() => undefined);
  const pipelineState = await readResearchPipelineState(root).catch(() => null);
  const runProfile = runState?.clarification_profile;
  const pipelineProfile = pipelineState?.clarification_profile;
  return {
    runState: runState?.id === runId ? runState : undefined,
    pipelineState,
    profile: runProfile ?? pipelineProfile
  };
}

async function persistClarificationProfile(root: string, input: {
  runId: string;
  question: ClarificationQuestion;
  patch: IdeaProfilePatch;
  previousProfile?: ClarificationRunProfile;
  scoreSnapshotId: string;
  resolvedBlockers: string[];
  remainingBlockers: string[];
  timestamp: string;
}): Promise<ClarificationRunProfile> {
  const previousAnswers = input.previousProfile?.answers ?? [];
  const answerRecord: ClarificationRunProfileAnswer = {
    question_id: input.question.id,
    question: input.question.question,
    topic: input.question.topic,
    field: input.patch.field,
    answer: input.question.answer ?? "",
    score_snapshot_id: input.scoreSnapshotId,
    resolved_blockers: input.resolvedBlockers,
    remaining_blockers: input.remainingBlockers,
    answered_at: input.question.answered_at ?? input.timestamp
  };
  const profile: ClarificationRunProfile = {
    original_idea: input.previousProfile?.original_idea ?? input.patch.updated_idea.replace(/\n\nClarification \([^)]+\): .+$/s, ""),
    updated_idea: input.patch.updated_idea,
    assumptions: [...new Set([...(input.previousProfile?.assumptions ?? []), ...input.patch.assumptions])],
    answers: [...previousAnswers.filter((answer) => answer.question_id !== input.question.id), answerRecord],
    score_snapshot_ids: [...new Set([...(input.previousProfile?.score_snapshot_ids ?? []), input.scoreSnapshotId])],
    updated_at: input.timestamp
  };
  const runState = await readRunState(root).catch(() => null);
  if (runState?.id === input.runId) {
    await writeRunState(root, {
      ...runState,
      idea: profile.updated_idea,
      updated_at: input.timestamp,
      clarification_profile: profile
    });
  }
  const pipelineState = await readResearchPipelineState(root).catch(() => null);
  if (pipelineState) {
    await writeResearchPipelineState(root, {
      ...pipelineState,
      idea: profile.updated_idea,
      updated_at: input.timestamp,
      clarification_profile: profile
    });
  }
  return profile;
}

function questionId(runId: string, topic: ClarificationTopic): string {
  return `q_${stableHash(`${runId}:${topic}`)}`;
}

function ledgerPath(root: string): string {
  return join(root, CLARIFICATION_QUESTIONS_LEDGER_PATH);
}

async function queueWrite(path: string, write: () => Promise<void>): Promise<void> {
  const previous = dialogueWriteQueues.get(path) ?? Promise.resolve();
  const queued = previous.catch(() => undefined).then(write);
  dialogueWriteQueues.set(path, queued);
  try {
    await queued;
  } finally {
    if (dialogueWriteQueues.get(path) === queued) dialogueWriteQueues.delete(path);
  }
}

async function readJsonlFile<T>(path: string): Promise<T[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function writeJsonlFile(path: string, entries: unknown[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, entries.map((entry) => JSON.stringify(entry)).join("\n") + (entries.length ? "\n" : ""), "utf8");
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
