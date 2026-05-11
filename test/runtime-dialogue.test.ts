import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createResearchPipelineState, readResearchPipelineState, writeResearchPipelineState } from "../src/pipeline/stage-state.js";
import {
  activeClarificationQuestions,
  answerClarificationQuestion,
  generateClarificationQuestions,
  readClarificationQuestions,
  recordClarificationQuestions
} from "../src/runtime/dialogue.js";
import { readScoreSnapshots } from "../src/runtime/ledgers.js";
import { createRunState, readRunState, writeRunState } from "../src/runtime/run-state.js";
import { strictCcfAScore } from "../src/skills/analysis/ccf-a-score.js";
import type { NoveltyAssessment } from "../src/skills/analysis/novelty-matrix.js";

test("clarification generation limits active questions and preserves scoring context", async () => {
  const score = strictCcfAScore({
    verifiedRelatedWorkCount: 0,
    pdfReadCount: 0,
    corePaperCount: 0,
    hasStrongBaseline: false,
    hasDatasetOrBenchmark: false,
    hasMetric: false,
    hasExecutableExperimentPlan: false
  });
  const questions = generateClarificationQuestions({
    runId: "run-1",
    idea: "Build an agent benchmark with unclear baselines and metrics.",
    score,
    novelty: blockedNovelty(),
    timestamp: "2026-05-11T00:00:00Z"
  });
  assert.equal(questions.length, 3);
  assert.equal(questions.every((question) => question.status === "active"), true);
  assert.equal(questions.every((question) => question.whyItMatters.length > 0), true);
  assert.equal(questions.every((question) => question.relatedScoreDimensions.length > 0), true);
  assert.equal(questions.every((question) => question.scoreInput.pdfReadCount === 0), true);
  assert.equal(questions.some((question) => question.topic === "related_work"), true);
});

test("clarification answers update idea profile and append refreshed score snapshots", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-dialogue-"));
  try {
    const emitted: Array<{ type: string; confidence?: number }> = [];
    await writeRunState(root, createRunState({
      runId: "run-1",
      idea: "Build an agent benchmark with a missing evaluation dataset.",
      outputRoot: root,
      now: "2026-05-11T00:00:00Z"
    }));
    await writeResearchPipelineState(root, createResearchPipelineState("Build an agent benchmark with a missing evaluation dataset.", root, "2026-05-11T00:00:00Z"));
    const score = strictCcfAScore({
      verifiedRelatedWorkCount: 5,
      pdfReadCount: 5,
      corePaperCount: 5,
      hasStrongBaseline: true,
      hasDatasetOrBenchmark: false,
      hasMetric: true,
      hasExecutableExperimentPlan: true
    });
    const questions = generateClarificationQuestions({
      runId: "run-1",
      idea: "Build an agent benchmark with a missing evaluation dataset.",
      score,
      scoreInput: {
        verifiedRelatedWorkCount: 5,
        pdfReadCount: 5,
        corePaperCount: 5,
        hasStrongBaseline: true,
        hasDatasetOrBenchmark: false,
        hasMetric: true,
        hasExecutableExperimentPlan: true
      },
      novelty: blockedNovelty(),
      timestamp: "2026-05-11T00:00:00Z",
      maxActive: 3
    });
    const datasetQuestion = questions.find((question) => question.topic === "dataset");
    assert.ok(datasetQuestion);
    await recordClarificationQuestions(root, [datasetQuestion], { runId: "run-1" });
    assert.equal((await activeClarificationQuestions(root, "run-1")).length, 1);

    const result = await answerClarificationQuestion(root, {
      runId: "run-1",
      questionId: datasetQuestion.id,
      answer: "Use AgentBench plus a curated failure-case split as the primary benchmark.",
      timestamp: "2026-05-11T00:01:00Z",
      events: { emit: (event) => { emitted.push(event); } }
    });

    assert.equal(result.question.status, "answered");
    assert.equal(result.score_input.hasDatasetOrBenchmark, true);
    assert.equal(result.score.caps.some((cap) => cap.reason === "No dataset/benchmark"), false);
    assert.equal(result.score_snapshot.confidence, result.score.confidence);
    assert.equal(emitted.find((event) => event.type === "score.updated")?.confidence, result.score.confidence);
    assert.ok(result.question.answer_effect?.resolved_blockers.includes("No dataset/benchmark"));
    assert.match(result.question.answer_effect?.profile_patch.updated_idea ?? "", /Clarification \(dataset or benchmark\)/);
    assert.match(result.profile.updated_idea, /AgentBench/);
    assert.equal((await activeClarificationQuestions(root, "run-1")).length, 0);
    assert.equal((await readClarificationQuestions(root)).at(-1)?.status, "answered");
    const runState = await readRunState(root);
    assert.match(runState.idea, /Clarification \(dataset or benchmark\)/);
    assert.match(runState.clarification_profile?.updated_idea ?? "", /AgentBench/);
    const pipelineState = await readResearchPipelineState(root);
    assert.match(pipelineState?.idea ?? "", /Clarification \(dataset or benchmark\)/);
    assert.equal(pipelineState?.clarification_profile?.answers[0]?.question_id, datasetQuestion.id);
    const snapshots = await readScoreSnapshots(root);
    assert.equal(snapshots.at(-1)?.stage_id, "clarification_dialogue");
    assert.equal(snapshots.at(-1)?.id, result.score_snapshot.id);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function blockedNovelty(): NoveltyAssessment {
  return {
    collision_risk: "low",
    reasons: ["No verified PDF evidence refs are available."],
    defensible_gap: "Read PDFs before making novelty claims.",
    evidence_refs: [],
    dimension_deltas: ["problem", "method", "data", "metric", "evaluation", "contribution"].map((dimension) => ({
      dimension: dimension as NoveltyAssessment["dimension_deltas"][number]["dimension"],
      status: "blocked",
      risk: "unknown",
      idea_signal: "missing in idea",
      prior_work_overlap: "Blocked: no verified prior-work evidence.",
      idea_delta: "No defensible delta until verified page/quote/chunk evidence exists.",
      evidence_refs: [],
      missing_evidence: ["Verified prior-work evidence"],
      recommended_actions: ["Read PDFs and extract page-level evidence before making novelty claims."]
    }))
  };
}
