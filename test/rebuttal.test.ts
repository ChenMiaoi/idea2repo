import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { generateReviewerLoop, readRebuttalTasks, replaceRebuttalTasks, resolveRebuttalTask } from "../src/runtime/rebuttal.js";
import { strictCcfAScore, type StrictScoreInput } from "../src/skills/analysis/ccf-a-score.js";

test("reviewer loop creates three reports and bound rebuttal tasks", () => {
  const scoreInput: StrictScoreInput = {
    verifiedRelatedWorkCount: 0,
    pdfReadCount: 0,
    corePaperCount: 0,
    hasExecutableExperimentPlan: false,
    highPriorWorkCollision: true
  };
  const loop = generateReviewerLoop({
    runId: "run-1",
    score: strictCcfAScore(scoreInput),
    scoreInput,
    evidenceRows: [],
    noteArtifacts: { "docs/reference/paper_notes/paper-1.md": "# Paper Note\n" },
    ccfVenueGate: { eligible_core_count: 0, required_core_count: 8, preliminary_only: true }
  });

  assert.deepEqual(loop.reviewers.map((reviewer) => reviewer.reviewer_id), ["R1", "R2", "R3"]);
  assert.ok(loop.reviewers.every((reviewer) => reviewer.verdict === "Weak reject"));
  assert.ok(loop.tasks.some((task) => task.id === "R1-M2" && task.binding.type === "paper_note"));
  assert.ok(loop.tasks.some((task) => task.reviewer_id === "R2" && task.score_dimension === "experimental_rigor"));
  assert.ok(loop.tasks.some((task) => task.reviewer_id === "R3" && task.score_dimension === "venue_story"));
  assert.equal(loop.tasks.every((task) => Boolean(task.binding.type && task.binding.ref)), true);
});

test("resolving a rebuttal task reruns score and records a new snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-rebuttal-"));
  try {
    const scoreInput: StrictScoreInput = {
      verifiedRelatedWorkCount: 0,
      pdfReadCount: 0,
      corePaperCount: 0,
      hasExecutableExperimentPlan: false
    };
    const loop = generateReviewerLoop({
      runId: "run-1",
      score: strictCcfAScore(scoreInput),
      scoreInput,
      evidenceRows: [],
      noteArtifacts: {},
      ccfVenueGate: { eligible_core_count: 0, required_core_count: 8, preliminary_only: true }
    });
    await replaceRebuttalTasks(root, { runId: "run-1" }, loop.tasks);
    const before = await readRebuttalTasks(root, "run-1");
    assert.ok(before.some((task) => task.status === "open"));

    const result = await resolveRebuttalTask(root, {
      runId: "run-1",
      taskId: before[0]!.id,
      resolution: "Added required evidence and updated the relevant artifact.",
      evidenceRefs: ["e1"]
    });

    assert.equal(result.task.status, "resolved");
    assert.equal(result.score_snapshot.stage_id, "reviewer_rebuttal_loop");
    assert.ok(result.score_snapshot.id);
    const after = await readRebuttalTasks(root, "run-1");
    assert.equal(after.find((task) => task.id === before[0]!.id)?.status, "resolved");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
