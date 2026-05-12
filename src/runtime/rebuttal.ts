import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { validateReviewerReport, type ReviewerReport } from "../agents/schemas.js";
import { strictCcfAScore, type StrictScoreInput, type StrictScoreResult } from "../skills/analysis/ccf-a-score.js";
import type { ClaimEvidenceRow } from "../skills/analysis/evidence-extract.js";
import type { LiteratureSearchResult } from "../literature.js";
import { appendScoreSnapshot, scoreSnapshotFromStrictScore, type ScoreSnapshot } from "./ledgers.js";
import { runtimeTimestamp, type EventSink } from "./events.js";

export const REBUTTAL_TASKS_LEDGER_PATH = join(".idea2repo", "rebuttal_tasks.jsonl");

export type RebuttalTaskBinding = {
  type: "paper_note" | "evidence_ref" | "score_dimension";
  ref: string;
};

export type RebuttalTask = {
  id: string;
  run_id: string;
  reviewer_id: "R1" | "R2" | "R3";
  status: "open" | "resolved";
  title: string;
  details: string;
  binding: RebuttalTaskBinding;
  score_dimension?: string;
  cap_reason?: string;
  evidence_refs: string[];
  created_at: string;
  resolved_at?: string;
  resolution?: string;
  score_snapshot_id?: string;
  current?: boolean;
  superseded_at?: string;
};

export type ReviewerLoop = {
  reviewers: ReviewerReport[];
  tasks: RebuttalTask[];
};

export type ResolveRebuttalTaskResult = {
  task: RebuttalTask;
  tasks: RebuttalTask[];
  score: StrictScoreResult;
  score_snapshot: ScoreSnapshot;
};

const reviewerRoles = {
  R1: "Novelty / Related Work",
  R2: "Method / Experiment",
  R3: "Venue / Story"
} as const;

export async function ensureRebuttalTasksLedger(root: string): Promise<void> {
  const path = join(root, REBUTTAL_TASKS_LEDGER_PATH);
  try {
    await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "", "utf8");
  }
}

export function generateReviewerLoop(input: {
  runId: string;
  score: StrictScoreResult;
  scoreInput: StrictScoreInput;
  evidenceRows: ClaimEvidenceRow[];
  noteArtifacts: Record<string, string>;
  ccfVenueGate: LiteratureSearchResult["ccf_gate"];
  agentReports?: ReviewerReport[];
  timestamp?: string;
}): ReviewerLoop {
  const timestamp = input.timestamp ?? runtimeTimestamp();
  const noteRefs = Object.keys(input.noteArtifacts).filter((path) => /^docs\/reference\/paper_notes\/[^/]+\.md$/i.test(path));
  const evidenceRefs = input.evidenceRows
    .filter((row) => row.status === "verified" && row.paper_id && row.chunk_id)
    .map((row) => `${row.paper_id}:${row.chunk_id}`);
  const caps = new Set(input.score.caps.map((cap) => cap.reason));
  const tasks = [
    ...reviewerOneTasks(input.runId, timestamp, caps, noteRefs, evidenceRefs, input.ccfVenueGate),
    ...reviewerTwoTasks(input.runId, timestamp, caps, evidenceRefs),
    ...reviewerThreeTasks(input.runId, timestamp, caps, input.score, input.ccfVenueGate)
  ];
  const deterministicReviewers = [
    reviewerReport("R1", verdictFor(input.score.total, tasks.some((task) => task.reviewer_id === "R1" && task.status === "open")), [
      "Novelty and related-work claims are not acceptable until every core comparison is grounded in paper notes.",
      input.ccfVenueGate.preliminary_only ? "The verified CCF-A path is blocked by insufficient qualified core papers." : "The CCF-A core-paper gate is satisfied."
    ], tasks, input.score),
    reviewerReport("R2", verdictFor(input.score.total, tasks.some((task) => task.reviewer_id === "R2" && task.status === "open")), [
      "Method claims need a reproducible experiment with baseline, dataset, metric, and ablations.",
      input.scoreInput.hasExecutableExperimentPlan ? "The current experiment plan is executable." : "The current experiment plan is not yet executable."
    ], tasks, input.score),
    reviewerReport("R3", verdictFor(input.score.total, tasks.some((task) => task.reviewer_id === "R3" && task.status === "open")), [
      "The paper story must justify a CCF-A main-track submission rather than an engineering artifact.",
      input.ccfVenueGate.preliminary_only ? "Venue fit remains preliminary until the CCF-A core set is complete." : "Venue gate evidence is available."
    ], tasks, input.score)
  ].map((report) => validateReviewerReport(report));
  const reviewers = deterministicReviewers.map((report) =>
    mergeReviewerReport(report, input.agentReports?.find((agentReport) => agentReport.reviewer_id === report.reviewer_id), tasks)
  );
  return { reviewers, tasks };
}

export async function replaceRebuttalTasks(root: string, scope: { runId: string; timestamp?: string }, tasks: RebuttalTask[]): Promise<void> {
  await ensureRebuttalTasksLedger(root);
  const path = join(root, REBUTTAL_TASKS_LEDGER_PATH);
  const existing = await readRebuttalTaskRecords(root);
  const supersededAt = scope.timestamp ?? runtimeTimestamp();
  const next = existing.map((task) => task.run_id === scope.runId && task.current !== false ? { ...task, current: false, superseded_at: supersededAt } : task);
  next.push(...tasks.map((task) => ({ ...task, current: true })));
  await writeRebuttalTaskRecords(path, next);
}

export async function readRebuttalTasks(root: string, runId?: string): Promise<RebuttalTask[]> {
  await ensureRebuttalTasksLedger(root);
  const records = await readRebuttalTaskRecords(root);
  return records.filter((task) => task.current !== false && (!runId || task.run_id === runId));
}

export async function resolveRebuttalTask(
  root: string,
  input: {
    runId: string;
    taskId: string;
    resolution: string;
    evidenceRefs?: string[];
    events?: EventSink;
  }
): Promise<ResolveRebuttalTaskResult> {
  await ensureRebuttalTasksLedger(root);
  const path = join(root, REBUTTAL_TASKS_LEDGER_PATH);
  const records = await readRebuttalTaskRecords(root);
  const tasks = records.filter((task) => task.current !== false && task.run_id === input.runId);
  const task = tasks.find((candidate) => candidate.id === input.taskId);
  if (!task) throw new Error(`rebuttal task not found: ${input.taskId}`);
  const timestamp = runtimeTimestamp();
  const resolved: RebuttalTask = {
    ...task,
    status: "resolved",
    resolved_at: timestamp,
    resolution: input.resolution,
    evidence_refs: [...new Set([...task.evidence_refs, ...(input.evidenceRefs ?? [])])]
  };
  const updatedTasks = tasks.map((candidate) => (candidate.id === task.id ? resolved : candidate));
  const scoreInput = scoreInputFromRebuttalTasks(updatedTasks);
  const score = strictCcfAScore(scoreInput);
  const snapshot = scoreSnapshotFromStrictScore({
    runId: input.runId,
    stageId: "reviewer_rebuttal_loop",
    score,
    evidenceRefs: scoreInput.evidenceRefs
  });
  resolved.score_snapshot_id = snapshot.id;
  const finalTasks = updatedTasks.map((candidate) => (candidate.id === resolved.id ? resolved : candidate));
  const nextRecords = records.map((candidate) => (candidate.current !== false && candidate.run_id === input.runId ? finalTasks.find((taskItem) => taskItem.id === candidate.id) ?? candidate : candidate));
  await writeRebuttalTaskRecords(path, nextRecords);
  await appendScoreSnapshot(root, snapshot);
  await writeRebuttalTasksMarkdownArtifact(root, finalTasks);
  await input.events?.emit({
    type: "rebuttal.task.resolved",
    run_id: input.runId,
    task_id: resolved.id,
    reviewer_id: resolved.reviewer_id,
    score_snapshot_id: snapshot.id,
    timestamp
  });
  await input.events?.emit({
    type: "score.updated",
    run_id: input.runId,
    stage_id: "reviewer_rebuttal_loop",
    score: score.total,
    max_score: 100,
    confidence: score.confidence,
    hard_blockers: score.caps.map((cap) => cap.reason),
    timestamp: runtimeTimestamp()
  });
  const artifactPath = join(root, "docs", "diagnosis", "rebuttal_tasks.md");
  await input.events?.emit({
    type: "artifact.written",
    run_id: input.runId,
    path: "docs/diagnosis/rebuttal_tasks.md",
    sha256: stableHash(await readFile(artifactPath, "utf8")),
    bytes: Buffer.byteLength(await readFile(artifactPath, "utf8")),
    timestamp: runtimeTimestamp()
  });
  return { task: resolved, tasks: finalTasks, score, score_snapshot: snapshot };
}

export function reviewerReportMarkdown(report: ReviewerReport, tasks: RebuttalTask[] = []): string {
  return `# Reviewer ${report.reviewer_id}: ${report.role}

## Verdict

${report.verdict}

## Summary

${report.summary}

## Major Concerns

${markdownList(report.major_concerns)}

## Minor Concerns

${markdownList(report.minor_concerns)}

## Required Evidence

${markdownList(report.required_evidence)}

## Questions

${markdownList(report.questions_to_authors)}

## Score-changing Conditions

${markdownList(report.what_would_change_my_score)}

## Actionable Tasks

${markdownList(tasks.filter((taskItem) => taskItem.reviewer_id === report.reviewer_id).map((taskItem) => `${taskItem.id}: ${taskItem.title} (binding: ${taskItem.binding.type}:${taskItem.binding.ref})`))}
`;
}

export function rebuttalTasksMarkdown(tasks: RebuttalTask[]): string {
  const rows = tasks.length
    ? tasks.map((task) => {
        const checked = task.status === "resolved" ? "x" : " ";
        const binding = `${task.binding.type}:${task.binding.ref}`;
        const evidence = task.evidence_refs.length ? task.evidence_refs.map((ref) => `\`${ref}\``).join(", ") : "none";
        return `- [${checked}] ${task.id}: ${task.title}
  - Reviewer: ${task.reviewer_id}
  - Status: ${task.status}
  - Binding: \`${binding}\`
  - Score dimension: ${task.score_dimension ?? "n/a"}
  - Evidence refs: ${evidence}
  - Details: ${task.details}${task.resolution ? `\n  - Resolution: ${task.resolution}` : ""}`;
      })
    : ["No open rebuttal tasks."];
  return `# Rebuttal Tasks

${rows.join("\n")}
`;
}

export async function writeRebuttalTasksMarkdownArtifact(root: string, tasks: RebuttalTask[]): Promise<void> {
  const path = join(root, "docs", "diagnosis", "rebuttal_tasks.md");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, rebuttalTasksMarkdown(tasks), "utf8");
}

function reviewerOneTasks(
  runId: string,
  timestamp: string,
  caps: Set<string>,
  noteRefs: string[],
  evidenceRefs: string[],
  gate: LiteratureSearchResult["ccf_gate"]
): RebuttalTask[] {
  const tasks: RebuttalTask[] = [];
  if (caps.has("No verified related work")) {
    tasks.push(task(runId, "R1", "M1", timestamp, "Add verified related-work comparisons from paper notes.", "Each novelty claim must cite a paper note with page, quote, and chunk provenance.", binding("score_dimension", "related_work"), "related_work", "No verified related work", evidenceRefs));
  }
  if (caps.has("No CCF-A core papers") || gate.preliminary_only) {
    tasks.push(task(runId, "R1", "M2", timestamp, "Complete the CCF-A main/full core paper set.", "The verified CCF-A path requires at least eight qualified core papers before strict novelty/scoring can be trusted.", noteRefs[0] ? binding("paper_note", noteRefs[0]) : binding("score_dimension", "related_work"), "related_work", "No CCF-A core papers", evidenceRefs));
  }
  if (caps.has("High prior-work collision")) {
    tasks.push(task(runId, "R1", "M3", timestamp, "Narrow the novelty delta against the closest collision.", "State the idea-vs-prior-work difference using direct evidence rather than broad claims.", evidenceRefs[0] ? binding("evidence_ref", evidenceRefs[0]) : binding("score_dimension", "novelty"), "novelty", "High prior-work collision", evidenceRefs.slice(0, 2)));
  }
  if (caps.has("No PDF read")) {
    tasks.push(task(runId, "R1", "M4", timestamp, "Replace metadata-only citations with PDF-backed notes.", "Reviewer #1 will not accept related-work claims without page, quote, and chunk ids.", noteRefs[0] ? binding("paper_note", noteRefs[0]) : binding("score_dimension", "related_work"), "related_work", "No PDF read", evidenceRefs));
  }
  return tasks;
}

function reviewerTwoTasks(runId: string, timestamp: string, caps: Set<string>, evidenceRefs: string[]): RebuttalTask[] {
  const tasks: RebuttalTask[] = [];
  if (caps.has("No baseline/dataset/metric")) {
    tasks.push(task(runId, "R2", "M1", timestamp, "Lock baseline, dataset or benchmark, and primary metric.", "The first experiment must name the reviewer-expected baseline, evaluation target, and success metric together.", binding("score_dimension", "experimental_rigor"), "experimental_rigor", "No baseline/dataset/metric", evidenceRefs));
  }
  if (caps.has("No executable experiment plan")) {
    tasks.push(task(runId, "R2", "M2", timestamp, "Write an executable experiment protocol.", "The plan must include commands, inputs, outputs, ablations, and reproduction criteria.", binding("score_dimension", "experimental_rigor"), "experimental_rigor", "No executable experiment plan", evidenceRefs));
  }
  if (caps.has("Engineering artifact without research question")) {
    tasks.push(task(runId, "R2", "M3", timestamp, "State the falsifiable research question.", "Implementation value is not enough; the method needs a testable claim reviewers can falsify.", binding("score_dimension", "method_clarity"), "method_clarity", "Engineering artifact without research question", evidenceRefs));
  }
  return tasks;
}

function reviewerThreeTasks(
  runId: string,
  timestamp: string,
  caps: Set<string>,
  score: StrictScoreResult,
  gate: LiteratureSearchResult["ccf_gate"]
): RebuttalTask[] {
  const tasks: RebuttalTask[] = [];
  if (gate.preliminary_only) {
    tasks.push(task(runId, "R3", "M1", timestamp, "Justify CCF-A main-track venue fit.", "Explain why the contribution belongs in a main/full CCF-A venue after the core paper gate is satisfied.", binding("score_dimension", "venue_story"), "venue_story", "No CCF-A core papers", []));
  }
  for (const cap of score.caps.filter((item) => /threat model|system evaluation|ML baselines|venue/i.test(item.reason))) {
    tasks.push(task(runId, "R3", `M${tasks.length + 2}`, timestamp, cap.reason, "Resolve the venue-specific story or evidence requirement before claiming submission readiness.", binding("score_dimension", "venue_story"), "venue_story", cap.reason, []));
  }
  return tasks;
}

function task(
  runId: string,
  reviewerId: RebuttalTask["reviewer_id"],
  localId: string,
  timestamp: string,
  title: string,
  details: string,
  bindingRef: RebuttalTaskBinding,
  scoreDimension: string,
  capReason: string | undefined,
  evidenceRefs: string[]
): RebuttalTask {
  return {
    id: `${reviewerId}-${localId}`,
    run_id: runId,
    reviewer_id: reviewerId,
    status: "open",
    title,
    details,
    binding: bindingRef,
    score_dimension: scoreDimension,
    cap_reason: capReason,
    evidence_refs: [...new Set(evidenceRefs)],
    created_at: timestamp
  };
}

function reviewerReport(
  reviewerId: ReviewerReport["reviewer_id"],
  verdict: ReviewerReport["verdict"],
  summaryLines: string[],
  tasks: RebuttalTask[],
  score: StrictScoreResult
): ReviewerReport {
  const reviewerTasks = tasks.filter((taskItem) => taskItem.reviewer_id === reviewerId);
  const role = reviewerRoles[reviewerId];
  return {
    reviewer_id: reviewerId,
    role,
    verdict,
    summary: summaryLines.join(" "),
    major_concerns: reviewerTasks.length ? reviewerTasks.map((taskItem) => `${taskItem.id}: ${taskItem.title}`) : [`No blocking ${role.toLowerCase()} concern was generated from the current strict score.`],
    minor_concerns: score.soft_weaknesses.slice(0, 3),
    required_evidence: reviewerTasks.map((taskItem) => `Resolve ${taskItem.id} via ${taskItem.binding.type}:${taskItem.binding.ref}`),
    questions_to_authors: reviewerTasks.map((taskItem) => `What concrete artifact or evidence resolves ${taskItem.id}?`),
    what_would_change_my_score: reviewerTasks.map((taskItem) => `Mark ${taskItem.id} resolved and rerun the strict score snapshot.`)
  };
}

function mergeReviewerReport(deterministic: ReviewerReport, agentReport: ReviewerReport | undefined, tasks: RebuttalTask[]): ReviewerReport {
  if (!agentReport || agentReport.role !== deterministic.role) return deterministic;
  const reviewerTasks = tasks.filter((taskItem) => taskItem.reviewer_id === deterministic.reviewer_id);
  return validateReviewerReport({
    reviewer_id: deterministic.reviewer_id,
    role: deterministic.role,
    verdict: stricterVerdict(deterministic.verdict, agentReport.verdict, reviewerTasks.length > 0),
    summary: `${agentReport.summary.trim() || deterministic.summary}\n\nDeterministic mandatory tasks remain binding: ${reviewerTasks.map((taskItem) => taskItem.id).join(", ") || "none"}.`,
    major_concerns: unique([...agentReport.major_concerns, ...deterministic.major_concerns]),
    minor_concerns: unique([...agentReport.minor_concerns, ...deterministic.minor_concerns]),
    required_evidence: unique([...agentReport.required_evidence, ...deterministic.required_evidence]),
    questions_to_authors: unique([...agentReport.questions_to_authors, ...deterministic.questions_to_authors]),
    what_would_change_my_score: unique([...agentReport.what_would_change_my_score, ...deterministic.what_would_change_my_score])
  });
}

function stricterVerdict(deterministic: ReviewerReport["verdict"], agent: ReviewerReport["verdict"], hasOpenTasks: boolean): ReviewerReport["verdict"] {
  if (hasOpenTasks && deterministic === "Weak reject") return "Weak reject";
  return severityRank(agent) < severityRank(deterministic) ? deterministic : agent;
}

function severityRank(verdict: ReviewerReport["verdict"]): number {
  if (verdict === "Weak reject") return 0;
  if (verdict === "Borderline") return 1;
  return 2;
}

function scoreInputFromRebuttalTasks(tasks: RebuttalTask[]): StrictScoreInput {
  const openCaps = new Set(tasks.filter((taskItem) => taskItem.status !== "resolved").map((taskItem) => taskItem.cap_reason).filter(Boolean) as string[]);
  const evidenceRefs = [...new Set(tasks.flatMap((taskItem) => taskItem.evidence_refs))];
  return {
    verifiedRelatedWorkCount: openCaps.has("No verified related work") ? 0 : 5,
    pdfReadCount: openCaps.has("No PDF read") ? 0 : 5,
    corePaperCount: openCaps.has("No CCF-A core papers") ? 0 : 8,
    hasStrongBaseline: !openCaps.has("No baseline/dataset/metric"),
    hasDatasetOrBenchmark: !openCaps.has("No baseline/dataset/metric"),
    hasMetric: !openCaps.has("No baseline/dataset/metric"),
    highPriorWorkCollision: openCaps.has("High prior-work collision"),
    pureEngineeringIntegration: openCaps.has("Engineering artifact without research question"),
    hasScientificHypothesis: !openCaps.has("Engineering artifact without research question"),
    hasExecutableExperimentPlan: !openCaps.has("No executable experiment plan"),
    venueRequiresThreatModel: [...openCaps].some((cap) => /threat model/i.test(cap)),
    hasThreatModel: ![...openCaps].some((cap) => /threat model/i.test(cap)),
    venueRequiresSystemEvaluation: [...openCaps].some((cap) => /system evaluation/i.test(cap)),
    hasPrototype: ![...openCaps].some((cap) => /system evaluation/i.test(cap)),
    venueExpectsStrongMlBaselines: [...openCaps].some((cap) => /ML baselines/i.test(cap)),
    hasStrongMlBaselines: ![...openCaps].some((cap) => /ML baselines/i.test(cap)),
    evidenceRefs
  };
}

function verdictFor(score: number, hasOpenTasks: boolean): ReviewerReport["verdict"] {
  if (hasOpenTasks || score < 50) return "Weak reject";
  if (score < 75) return "Borderline";
  return "Weak accept";
}

function binding(type: RebuttalTaskBinding["type"], ref: string): RebuttalTaskBinding {
  return { type, ref };
}

async function readRebuttalTaskRecords(root: string): Promise<RebuttalTask[]> {
  const path = join(root, REBUTTAL_TASKS_LEDGER_PATH);
  const raw = await readFile(path, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  });
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RebuttalTask);
}

async function writeRebuttalTaskRecords(path: string, tasks: RebuttalTask[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, tasks.map((taskItem) => JSON.stringify(taskItem)).join("\n") + (tasks.length ? "\n" : ""), "utf8");
}

function markdownList(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None";
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function stableHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
