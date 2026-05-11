import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { ApprovalDialog } from "../src/tui/ApprovalDialog.js";
import { ArtifactPanel } from "../src/tui/ArtifactPanel.js";
import { PlanPanel } from "../src/tui/PlanPanel.js";
import { TracePanel } from "../src/tui/TracePanel.js";
import type { Idea2RepoEvent } from "../src/runtime/events.js";
import type { PlanState } from "../src/runtime/plan.js";

test("runtime TUI panels render as React elements", () => {
  const plan: PlanState = {
    version: 1,
    run_id: "run-1",
    updated_at: "2026-01-01T00:00:00Z",
    items: [
      {
        id: "idea_intake",
        stage_id: "idea_intake",
        step: "Idea intake",
        status: "in_progress",
        artifacts: ["docs/idea.md"],
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]
  };
  const events: Idea2RepoEvent[] = [
    {
      type: "run.started",
      run_id: "run-1",
      idea: "test idea",
      output_root: "generated_repos/test",
      timestamp: "2026-01-01T00:00:00Z"
    }
  ];

  assert.equal(React.isValidElement(PlanPanel({ plan })), true);
  assert.equal(React.isValidElement(TracePanel({ events })), true);
  assert.equal(React.isValidElement(ArtifactPanel({ artifacts: [{ path: "docs/idea.md", bytes: 12, text: true }] })), true);
  assert.equal(React.isValidElement(ApprovalDialog({ action: "publish", risk: "network" })), true);
});
