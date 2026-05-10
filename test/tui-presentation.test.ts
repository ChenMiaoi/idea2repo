import assert from "node:assert/strict";
import { test } from "node:test";
import { createWorkflowSteps, activateWorkflowStep, completeWorkflowSteps, mergeActivity, presentProgressMessage } from "../src/tui/presentation.js";

test("TUI progress presentation converts raw provider logs into polished activities", () => {
  assert.deepEqual(presentProgressMessage("Codex OAuth: receiving structured analysis"), {
    title: "Structured analysis streaming",
    detail: "Reading scores, risks, evidence needs, and revision guidance.",
    stage: "analysis"
  });
  assert.deepEqual(presentProgressMessage("Network proxy enabled: http=127.0.0.1:7890"), {
    title: "Network route prepared",
    detail: "Using the configured local proxy for Codex network traffic.",
    stage: "provider"
  });
  assert.deepEqual(presentProgressMessage("Analysis: offline deterministic fallback"), {
    title: "Offline analysis route",
    detail: "Using deterministic scoring and scaffold planning without network calls.",
    stage: "analysis",
    tone: "warning"
  });
});

test("TUI workflow route tracks active and completed steps", () => {
  const routed = activateWorkflowStep(createWorkflowSteps("intake"), "analysis");
  assert.deepEqual(
    routed.map((step) => step.status),
    ["done", "done", "active", "pending", "pending"]
  );
  assert.deepEqual(
    completeWorkflowSteps(routed).map((step) => step.status),
    ["done", "done", "done", "done", "done"]
  );
});

test("TUI activity feed deduplicates streaming updates", () => {
  const activity = presentProgressMessage("Codex OAuth: receiving structured analysis");
  const merged = mergeActivity(mergeActivity([], activity), activity);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.count, 2);
});
