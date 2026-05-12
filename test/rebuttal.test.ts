import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { generateReviewerLoop, readRebuttalTasks, rebuttalTasksMarkdown, replaceRebuttalTasks, resolveRebuttalTask, reviewerReportMarkdown } from "../src/runtime/rebuttal.js";
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
  const markdown = reviewerReportMarkdown(loop.reviewers[0]!, loop.tasks);
  for (const heading of ["Verdict", "Summary", "Major Concerns", "Required Evidence", "Questions", "Score-changing Conditions", "Actionable Tasks"]) {
    assert.match(markdown, new RegExp(`## ${heading}`));
  }
  assert.match(markdown, /R1-M/);
});

test("agent reviewer reports cannot remove deterministic cap-derived tasks", () => {
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
    ccfVenueGate: { eligible_core_count: 0, required_core_count: 8, preliminary_only: true },
    agentReports: [
      {
        reviewer_id: "R1",
        role: "Novelty / Related Work",
        verdict: "Weak accept",
        summary: "Agent believes the related work is fine.",
        major_concerns: ["Agent-only concern"],
        minor_concerns: [],
        required_evidence: ["Agent-only evidence"],
        questions_to_authors: ["Agent-only question?"],
        what_would_change_my_score: ["Agent-only condition"]
      }
    ]
  });
  const r1 = loop.reviewers.find((reviewer) => reviewer.reviewer_id === "R1");
  assert.ok(r1);
  assert.equal(r1.verdict, "Weak reject");
  assert.ok(r1.major_concerns.some((concern) => /Agent-only concern/.test(concern)));
  assert.ok(r1.major_concerns.some((concern) => /^R1-M/.test(concern)));
  assert.ok(loop.tasks.some((task) => task.reviewer_id === "R1" && task.status === "open"));
  assert.match(reviewerReportMarkdown(r1, loop.tasks), /Actionable Tasks[\s\S]*R1-M/);
});

test("agent reviewer concerns and evidence requests become additional bound tasks", () => {
  const scoreInput: StrictScoreInput = {
    verifiedRelatedWorkCount: 5,
    pdfReadCount: 5,
    corePaperCount: 8,
    hasStrongBaseline: true,
    hasDatasetOrBenchmark: true,
    hasMetric: true,
    hasExecutableExperimentPlan: true,
    hasScientificHypothesis: true,
    evidenceRefs: ["base-ref"]
  };
  const loop = generateReviewerLoop({
    runId: "run-1",
    score: strictCcfAScore(scoreInput),
    scoreInput,
    evidenceRows: [
      {
        paper_id: "paper-1",
        claim: "Ablation protocol evidence",
        claim_type: "method",
        required_evidence: "page quote chunk",
        planned_artifact: "docs/reference/paper_notes/paper-1.md",
        status: "verified",
        page: "2",
        quote: "ablation protocol",
        chunk_id: "p2-c1",
        confidence: 0.8
      }
    ],
    noteArtifacts: { "docs/reference/paper_notes/paper-1.md": "# Paper Note\n" },
    ccfVenueGate: { eligible_core_count: 8, required_core_count: 8, preliminary_only: false },
    agentReports: [
      {
        reviewer_id: "R2",
        role: "Method / Experiment",
        verdict: "Borderline",
        summary: "Agent reviewer wants a tighter method story.",
        major_concerns: ["Experiment protocol lacks an ablation tied to the central claim."],
        minor_concerns: [],
        required_evidence: ["Add page quote chunk evidence for the ablation protocol."],
        questions_to_authors: [],
        what_would_change_my_score: []
      }
    ]
  });

  const agentTasks = loop.tasks.filter((task) => task.source === "agent");
  assert.equal(agentTasks.length, 2);
  assert.ok(agentTasks.some((task) => task.id === "R2-A1" && task.binding.type === "score_dimension" && task.score_dimension === "experimental_rigor"));
  assert.ok(agentTasks.some((task) => task.id === "R2-E1" && task.binding.type === "evidence_ref" && task.binding.ref === "paper-1:p2-c1"));
  assert.ok(agentTasks.every((task) => task.score_input_context?.verifiedRelatedWorkCount === 5));
  const r2 = loop.reviewers.find((reviewer) => reviewer.reviewer_id === "R2");
  assert.match(r2?.summary ?? "", /Additional reviewer tasks are tracked separately/);
});

test("all agent reviewer concerns and evidence requests persist as ledger tasks", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-rebuttal-agent-ledger-"));
  try {
    const scoreInput: StrictScoreInput = {
      verifiedRelatedWorkCount: 5,
      pdfReadCount: 5,
      corePaperCount: 8,
      hasStrongBaseline: true,
      hasDatasetOrBenchmark: true,
      hasMetric: true,
      hasExecutableExperimentPlan: true,
      hasScientificHypothesis: true
    };
    const majorConcerns = Array.from({ length: 5 }, (_, index) => `Concern ${index + 1} requires method cleanup.`);
    const requiredEvidence = Array.from({ length: 5 }, (_, index) => `Evidence ${index + 1} needs page quote chunk support.`);
    const loop = generateReviewerLoop({
      runId: "run-1",
      score: strictCcfAScore(scoreInput),
      scoreInput,
      evidenceRows: [
        {
          paper_id: "paper-1",
          claim: "Protocol evidence",
          claim_type: "method",
          required_evidence: "page quote chunk",
          planned_artifact: "docs/reference/paper_notes/paper-1.md",
          status: "verified",
          page: "2",
          quote: "protocol evidence",
          chunk_id: "p2-c1",
          confidence: 0.8
        }
      ],
      noteArtifacts: { "docs/reference/paper_notes/paper-1.md": "# Paper Note\n" },
      ccfVenueGate: { eligible_core_count: 8, required_core_count: 8, preliminary_only: false },
      agentReports: [
        {
          reviewer_id: "R2",
          role: "Method / Experiment",
          verdict: "Borderline",
          summary: "Agent reviewer has many method requests.",
          major_concerns: majorConcerns,
          minor_concerns: [],
          required_evidence: requiredEvidence,
          questions_to_authors: [],
          what_would_change_my_score: []
        }
      ]
    });
    await replaceRebuttalTasks(root, { runId: "run-1" }, loop.tasks);
    const persisted = await readRebuttalTasks(root, "run-1");
    const agentTasks = persisted.filter((task) => task.source === "agent");
    assert.equal(agentTasks.length, majorConcerns.length + requiredEvidence.length);
    assert.ok(agentTasks.every((task) => ["paper_note", "evidence_ref", "score_dimension"].includes(task.binding.type)));
    const markdown = rebuttalTasksMarkdown(agentTasks);
    assert.match(markdown, /Source: agent/);
    assert.match(markdown, /R2-A5/);
    assert.match(markdown, /R2-E5/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test("resolving a rebuttal task preserves original score input context", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-rebuttal-context-"));
  try {
    const scoreInput: StrictScoreInput = {
      verifiedRelatedWorkCount: 1,
      pdfReadCount: 1,
      corePaperCount: 1,
      ccfAGateBlocked: true,
      hasStrongBaseline: true,
      hasDatasetOrBenchmark: true,
      hasMetric: true,
      hasExecutableExperimentPlan: false,
      singlePersonTwelveWeekInfeasible: true,
      evidenceRefs: ["original-ref"]
    };
    const loop = generateReviewerLoop({
      runId: "run-1",
      score: strictCcfAScore(scoreInput),
      scoreInput,
      evidenceRows: [],
      noteArtifacts: {},
      ccfVenueGate: { eligible_core_count: 1, required_core_count: 8, preliminary_only: true }
    });
    await replaceRebuttalTasks(root, { runId: "run-1" }, loop.tasks);
    const executableTask = loop.tasks.find((task) => task.cap_reason === "No executable experiment plan");
    assert.ok(executableTask);

    const result = await resolveRebuttalTask(root, {
      runId: "run-1",
      taskId: executableTask.id,
      resolution: "Added runnable protocol commands.",
      evidenceRefs: ["protocol-ref"]
    });

    assert.equal(result.score_input.hasExecutableExperimentPlan, true);
    assert.equal(result.score_input.verifiedRelatedWorkCount, 1);
    assert.equal(result.score_input.pdfReadCount, 1);
    assert.equal(result.score_input.ccfAGateBlocked, true);
    assert.equal(result.score_input.singlePersonTwelveWeekInfeasible, true);
    assert.deepEqual(result.score_input.evidenceRefs?.sort(), ["original-ref", "protocol-ref"].sort());
    assert.ok(result.score.caps.some((cap) => cap.reason === "CCF-A venue gate blocked"));
    assert.ok(result.score.caps.some((cap) => cap.reason === "Single-person/12-week plan is clearly infeasible"));
    assert.equal(result.score.caps.some((cap) => cap.reason === "No executable experiment plan"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
