import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main } from "../src/cli.js";
import { DecisionRecorder, formatDecisions, readDecisionRecords } from "../src/runtime/decisions.js";

test("DecisionRecorder writes records and emits decision event", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-decisions-"));
  const events: string[] = [];
  try {
    const recorder = new DecisionRecorder(root, "run-1", {
      emit: (event) => {
        events.push(event.type);
      }
    });
    await recorder.record({
      id: "decision-1",
      stage_id: "idea_intake",
      title: "Route selected",
      rationale_summary: "Visible summary only.",
      inputs_considered: ["idea"],
      evidence_refs: [{ artifact: "docs/idea/idea_brief.md" }],
      alternatives: [{ option: "skip", why_not: "needed" }],
      confidence: "high",
      created_at: "2026-05-11T00:00:00Z"
    });
    const records = await readDecisionRecords(root);
    assert.equal(records[0]?.id, "decision-1");
    assert.equal(records[0]?.rationale_summary.includes("Visible summary"), true);
    assert.deepEqual(events, ["decision.recorded"]);
    assert.match(formatDecisions(records), /Route selected/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("research pipeline records visible decisions and trace --decisions prints them", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-decisions-cli-"));
  const output = join(root, "project");
  try {
    assert.equal(await main(["research", "Build an LLM agent benchmark.", "--offline", "--provider", "offline", "--output", output, "--jsonl-events"]), 0);
    const records = await readDecisionRecords(output);
    const stages = new Set(records.map((record) => record.stage_id));
    for (const stage of [
      "idea_intake",
      "search_planning",
      "candidate_triage",
      "pdf_reading",
      "related_work_analysis",
      "novelty_analysis",
      "ccf_a_strict_scoring",
      "feasibility_review",
      "better_idea_synthesis",
      "venue_template_packaging"
    ]) {
      assert.equal(stages.has(stage), true, `missing decision for ${stage}`);
    }
    assert.equal(records.some((record) => /chain-of-thought/i.test(record.rationale_summary)), false);
    const report = await readFile(join(output, "docs", "diagnosis", "ccf_a_readiness_report.md"), "utf8");
    assert.match(report, /## Runtime Decision Trace/);
    assert.match(report, /Idea routed for research pipeline/);
    assert.match(report, /Novelty collision risk assessed/);
    assert.equal(await main(["trace", "--decisions", "--output", output]), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
