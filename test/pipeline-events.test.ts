import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { generateResearchRepo } from "../src/generator.js";
import { main } from "../src/cli.js";
import { runResearchPipeline } from "../src/pipeline/research-pipeline.js";
import { readResearchPipelineState } from "../src/pipeline/stage-state.js";
import { JsonlEventSink, readJsonlEvents } from "../src/runtime/events.js";

test("research pipeline emits run and stage events to a sink", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-pipeline-events-"));
  const trace = join(root, ".idea2repo", "trace.jsonl");
  try {
    await runResearchPipeline("Build an LLM agent benchmark with baselines and metrics.", {
      outputRoot: root,
      provider: "offline",
      runId: "run-test",
      events: new JsonlEventSink(trace)
    });

    const events = await readJsonlEvents(trace);
    assert.equal(events[0]?.type, "run.started");
    assert.equal(events.at(-1)?.type, "run.completed");
    assert.ok(events.some((event) => event.type === "stage.started" && event.stage_id === "idea_intake"));
    assert.ok(events.some((event) => event.type === "stage.completed" && event.stage_id === "ccf_a_strict_scoring"));
    assert.ok(events.some((event) => event.type === "stage.completed" && event.stage_id === "clarification_dialogue"));
    assert.ok(events.some((event) => event.type === "stage.skipped" && event.stage_id === "pdf_reading"));
    assert.ok(events.some((event) => event.type === "idea.optimized" && /LLM agent benchmark/.test(event.summary)));
    assert.ok(events.some((event) => event.type === "solution.generated" && event.artifacts.includes("docs/proposal/solution_design.md")));
    assert.ok(events.some((event) => event.type === "score.updated" && event.score === 39));
    const question = events.find((event) => event.type === "question.asked") as Extract<(typeof events)[number], { type: "question.asked" }> | undefined;
    assert.ok(question);
    assert.match(question.why_it_matters, /cap|score|evidence/i);
    const state = await readResearchPipelineState(root);
    const ideaStage = state?.stages.find((stage) => stage.id === "idea_intake");
    assert.deepEqual(ideaStage?.input_refs, ["idea"]);
    assert.ok(ideaStage?.output_refs.includes("docs/idea/idea_brief.md"));
    assert.ok(ideaStage?.decision_ids.length);
    const pdfStage = state?.stages.find((stage) => stage.id === "pdf_reading");
    assert.equal(pdfStage?.status, "skipped");
    assert.match(pdfStage?.blocker ?? "", /No downloaded PDFs/);
    const clarificationStage = state?.stages.find((stage) => stage.id === "clarification_dialogue");
    assert.equal(clarificationStage?.status, "completed");
    assert.ok(clarificationStage?.decision_ids.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI research writes canonical runtime and report artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-cli-events-"));
  const output = join(root, "project");
  try {
    assert.equal(
      await main([
        "research",
        "Build an LLM agent benchmark with baselines and metrics.",
        "--offline",
        "--provider",
        "offline",
        "--output",
        output
      ]),
      0
    );
    const raw = await readFile(join(output, ".idea2repo", "trace.jsonl"), "utf8");
    assert.match(raw, /"run\.started"/);
    assert.match(raw, /"stage\.started"/);
    assert.match(raw, /"score\.updated"/);
    assert.match(raw, /"run\.completed"/);
    assert.match(await readFile(join(output, "reports", "ccf_a_readiness_report.md"), "utf8"), /Canonical Artifact Bundle/);
    assert.match(await readFile(join(output, "reports", "novelty_matrix.md"), "utf8"), /Novelty Gap Matrix/);
    assert.match(await readFile(join(output, "reports", "related_work.md"), "utf8"), /Related Work Report/);
    assert.match(await readFile(join(output, "reports", "evidence_ledger.md"), "utf8"), /Evidence Ledger/);
    assert.match(await readFile(join(output, "plans", "12_week_execution_plan.md"), "utf8"), /12 Week Execution Plan/);
    assert.match(await readFile(join(output, "plans", "experiment_plan.md"), "utf8"), /Experiment Plan/);
    assert.match(await readFile(join(output, "docs", "proposal", "strict_execution_plan.md"), "utf8"), /12-Week Execution Table/);
    assert.match(await readFile(join(output, "docs", "proposal", "solution_design.md"), "utf8"), /Solution Design/);
    assert.match(await readFile(join(output, "paper", "abstract.md"), "utf8"), /Abstract Draft/);
    assert.match(await readFile(join(output, "paper", "related_work.md"), "utf8"), /Related Work Draft/);
    assert.match(await readFile(join(output, "papers", "papers.bib"), "utf8"), /Do not invent paper titles/);
    const runState = JSON.parse(await readFile(join(output, ".idea2repo", "run_state.json"), "utf8")) as { status: string; event_count: number; last_event_type: string; result?: { project_name?: string } };
    assert.equal(runState.status, "completed");
    assert.equal(runState.last_event_type, "run.completed");
    assert.equal(runState.result?.project_name, "project");
    assert.ok(runState.event_count > 0);
    assert.equal(await readFile(join(output, ".idea2repo", "evidence.jsonl"), "utf8"), "");
    const scoreSnapshots = (await readFile(join(output, ".idea2repo", "score_snapshots.jsonl"), "utf8"))
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { score: number; hard_blockers: string[] });
    assert.equal(scoreSnapshots.at(-1)?.score, 39);
    assert.ok(scoreSnapshots.at(-1)?.hard_blockers.includes("No PDF read"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generator persists failed run_state for early validation failures", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-cli-run-state-failed-"));
  const output = join(root, "project");
  try {
    await assert.rejects(
      generateResearchRepo("Build an LLM agent benchmark.", output, {
        runId: "run-failed",
        timelineWeeks: 10,
        permissionPolicy: {
          allowWrite: true,
          allowOverwrite: false,
          allowNetwork: false,
          allowLogin: false,
          allowInstall: false,
          allowPublish: false
        }
      }),
      /timeline_weeks/
    );
    const runState = JSON.parse(await readFile(join(output, ".idea2repo", "run_state.json"), "utf8")) as { status: string; error?: string; last_event_type?: string };
    assert.equal(runState.status, "failed");
    assert.equal(runState.last_event_type, "run.failed");
    assert.match(runState.error ?? "", /timeline_weeks/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("generator persists failed run_state for empty idea validation", async () => {
  const root = await mkdtemp(join(tmpdir(), "idea2repo-cli-run-state-empty-"));
  const output = join(root, "project");
  try {
    await assert.rejects(
      generateResearchRepo("", output, {
        runId: "run-empty",
        permissionPolicy: {
          allowWrite: true,
          allowOverwrite: false,
          allowNetwork: false,
          allowLogin: false,
          allowInstall: false,
          allowPublish: false
        }
      }),
      /idea must not be empty/
    );
    const runState = JSON.parse(await readFile(join(output, ".idea2repo", "run_state.json"), "utf8")) as { status: string; error?: string; last_event_type?: string };
    assert.equal(runState.status, "failed");
    assert.equal(runState.last_event_type, "run.failed");
    assert.match(runState.error ?? "", /idea must not be empty/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
