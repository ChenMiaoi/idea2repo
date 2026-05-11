import { describe, expect, it } from "vitest";
import { applyRuntimeEvent, createRuntimeView } from "./runtime";
import type { RuntimeEvent } from "./types";

describe("web runtime view", () => {
  it("applies live plan trace artifact decision and approval events", () => {
    let view = createRuntimeView({ run_id: "run-1", output_root: "generated_repos/demo", status: "running" });
    const events: RuntimeEvent[] = [
      {
        type: "plan.updated",
        run_id: "run-1",
        timestamp: "2026-01-01T00:00:00Z",
        plan: [
          {
            id: "idea_intake",
            stage_id: "idea_intake",
            step: "Idea intake",
            status: "in_progress",
            artifacts: ["docs/idea/idea_brief.md"],
            updated_at: "2026-01-01T00:00:00Z"
          }
        ]
      },
      {
        type: "artifact.written",
        run_id: "run-1",
        path: "docs/idea/idea_brief.md",
        sha256: "abc",
        bytes: 12,
        timestamp: "2026-01-01T00:00:01Z"
      },
      {
        type: "decision.recorded",
        run_id: "run-1",
        decision_id: "decision-1",
        title: "Accepted idea",
        stage_id: "idea_intake",
        timestamp: "2026-01-01T00:00:02Z"
      },
      {
        type: "approval.requested",
        run_id: "run-1",
        approval_id: "approval-1",
        action: "tool:github.publish",
        risk: "network, publish",
        timestamp: "2026-01-01T00:00:03Z"
      },
      {
        type: "run.completed",
        run_id: "run-1",
        timestamp: "2026-01-01T00:00:04Z"
      }
    ];

    for (const event of events) view = applyRuntimeEvent(view, event);

    expect(view.status).toBe("completed");
    expect(view.events).toHaveLength(events.length);
    expect(view.plan[0]?.status).toBe("in_progress");
    expect(view.artifacts[0]?.path).toBe("docs/idea/idea_brief.md");
    expect(view.decisions[0]?.title).toBe("Accepted idea");
    expect(view.approvals[0]?.action).toBe("tool:github.publish");
  });
});
