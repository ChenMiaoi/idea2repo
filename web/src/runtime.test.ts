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
            input_refs: ["idea"],
            output_refs: ["docs/idea/idea_brief.md"],
            evidence_refs: [],
            decision_ids: [],
            next_actions: ["Run idea intake"],
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
        type: "paper.found",
        run_id: "run-1",
        paper_id: "paper-1",
        title: "Evidence First Agents",
        venue: "NeurIPS",
        year: 2026,
        pdf_status: "available",
        timestamp: "2026-01-01T00:00:02Z"
      },
      {
        type: "pdf.downloaded",
        run_id: "run-1",
        paper_id: "paper-1",
        path: "docs/reference/pdfs/paper-1.pdf",
        sha256: "pdf-sha",
        bytes: 120,
        extraction_quality: "ok",
        timestamp: "2026-01-01T00:00:02Z"
      },
      {
        type: "evidence.extracted",
        run_id: "run-1",
        evidence_id: "evidence-1",
        paper_id: "paper-1",
        claim: "Uses page-level evidence",
        claim_type: "method",
        page: 3,
        quote: "page quote",
        chunk_id: "paper-1-p3-c1",
        confidence: 0.82,
        timestamp: "2026-01-01T00:00:02Z"
      },
      {
        type: "question.asked",
        run_id: "run-1",
        question_id: "question-1",
        question: "Which dataset is primary?",
        why_it_matters: "It changes the score.",
        related_score_dimensions: ["evaluation"],
        evidence_refs: ["evidence-1"],
        required: true,
        timestamp: "2026-01-01T00:00:02Z"
      },
      {
        type: "score.updated",
        run_id: "run-1",
        score: 62,
        max_score: 100,
        confidence: 0.7,
        hard_blockers: ["Need dataset"],
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
    expect(view.papers[0]?.pdf_status).toBe("downloaded");
    expect(view.evidence[0]?.chunk_id).toBe("paper-1-p3-c1");
    expect(view.questions[0]?.required).toBe(true);
    expect(view.scores[0]?.score).toBe(62);
  });
});
