import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkflowSteps, activateWorkflowStep, completeWorkflowSteps, mergeActivity, presentProgressMessage } from "../src/tui/presentation.js";

test("TUI progress presentation converts raw provider logs into polished activities", () => {
  assert.deepEqual(presentProgressMessage("Codex OAuth: receiving structured analysis"), {
    title: "Structured analysis streaming",
    detail: "Reading scores, risks, evidence needs, and revision guidance.",
    stage: "ccf_a_strict_scoring"
  });
  assert.deepEqual(presentProgressMessage("Network proxy enabled: http=127.0.0.1:7890"), {
    title: "Network route prepared",
    detail: "Using the configured local proxy for Codex network traffic.",
    stage: "provider"
  });
  assert.deepEqual(presentProgressMessage("Analysis: offline deterministic fallback"), {
    title: "Offline analysis route",
    detail: "Using deterministic scoring and scaffold planning without network calls.",
    stage: "ccf_a_strict_scoring",
    tone: "warning"
  });
});

test("TUI workflow route tracks active and completed steps", () => {
  const routed = activateWorkflowStep(createWorkflowSteps("idea_intake"), "related_work_analysis");
  assert.equal(routed.length, 14);
  assert.deepEqual(routed.map((step) => step.label), ["Intake", "Search", "Papers", "Papers", "PDF", "Notes", "Survey", "Novelty", "Score", "Questions", "Feasibility", "Idea", "Reports", "Reports"]);
  assert.equal(routed.find((step) => step.id === "related_work_analysis")?.status, "active");
  assert.equal(routed.find((step) => step.id === "pdf_reading")?.status, "done");
  assert.equal(routed.find((step) => step.id === "novelty_analysis")?.status, "pending");
  assert.equal(completeWorkflowSteps(routed).every((step) => step.status === "done"), true);
});

test("TUI activity feed deduplicates streaming updates", () => {
  const activity = presentProgressMessage("Codex OAuth: receiving structured analysis");
  const merged = mergeActivity(mergeActivity([], activity), activity);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.count, 2);
});
