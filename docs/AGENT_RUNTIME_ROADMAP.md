# Agent Runtime Roadmap

Idea2Repo is moving from an evidence-first repository generator toward an agentic research repository builder with observable, resumable, and approvable runtime behavior.

## Goal

Build a local-first runtime for research ideas that exposes:

- a typed event stream for runs, stages, tools, artifacts, approvals, decisions, and plan updates;
- a live plan that can be shown in CLI, TUI, API, and Web views;
- visible decision records that summarize rationale without exposing raw chain-of-thought;
- typed tools with explicit risk metadata and approval policy checks;
- session resume, retry, skip, cancel, artifact snapshots, and rollback;
- provider adapters for deterministic offline behavior, Codex OAuth, and the official Codex CLI.

## MVP

The minimum useful runtime adds:

- `.idea2repo/trace.jsonl`;
- `.idea2repo/plan.json`;
- `.idea2repo/decisions.jsonl`;
- pipeline run/stage events;
- artifact-written events;
- CLI `plan` and `trace` commands;
- TUI plan and trace panels;
- publish approval enforcement;
- tests for runtime events, plan state, decisions, and pipeline event emission.

## Phases

1. **Contract and events**: define runtime contracts, add `EventBus`, write `trace.jsonl`, and emit run/stage events from the research pipeline.
2. **Live plan and decisions**: derive a plan from `researchStages`, persist plan changes, and record visible decision summaries for route/search/scoring/template choices.
3. **TUI and CLI observability**: expose plan, trace, decisions, and artifacts in CLI and Ink runtime panels.
4. **Tools and approvals**: register core artifact, plan, decision, literature, scoring, and GitHub tools; route network/publish/write-overwrite actions through approval policy.
5. **Providers and API**: standardize provider adapters, enable `openai-codex-cli`, add run manager and SSE runtime endpoints.
6. **Recovery and rollback**: add retry, skip, cancel, artifact snapshots, and restore commands.

## Boundaries

- Idea2Repo remains a research-domain agent, not a general coding agent.
- Runtime views show plan, transcript summaries, tool results, evidence traces, and decision records, not raw chain-of-thought.
- Network, publish, and overwrite actions must be explicit, approvable, and logged.
- CLI, TUI, API, and Web must share the same runtime contract instead of each inventing its own state shape.
- Artifact-level snapshots come before any workspace-level rollback mechanism.

