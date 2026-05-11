# Runtime Contract

This contract defines the shared runtime surface used by the CLI, TUI, API, Web dashboard, and tests.

## Events

Runtime events are append-only JSON objects with `type`, `run_id`, and `timestamp`.

Core event types:

- `run.started`, `run.completed`, `run.failed`, `run.cancelled`
- `stage.started`, `stage.completed`, `stage.skipped`, `stage.failed`
- `plan.updated`
- `decision.recorded`
- `artifact.written`, `artifact.snapshot`, `artifact.restored`
- `tool.started`, `tool.completed`
- `approval.requested`, `approval.resolved`

Events are written to `.idea2repo/trace.jsonl`. Tool calls are also written to `.idea2repo/tool_calls.jsonl`. Approval and decision records have dedicated JSONL logs.

## Plan

`PlanState` is persisted to `.idea2repo/plan.json`.

Rules:

- version is `1`;
- plan items are derived from `researchStages`;
- at most one item may be `in_progress`;
- `stage.started` moves the matching item to `in_progress`;
- `stage.completed` moves it to `completed`;
- `stage.skipped` and `stage.failed` move it to `blocked` with a blocker when present;
- every plan mutation emits `plan.updated`.

## Decisions

`DecisionRecord` is persisted to `.idea2repo/decisions.jsonl`.

Decision records contain a visible rationale summary, inputs considered, optional evidence refs, alternatives, confidence, and timestamp. They must not include raw chain-of-thought, private provider responses, tokens, cookies, or API keys.

## Approvals

Runtime modes:

- `plan`: read-only by default; network requires approval; writes/publish/shell denied.
- `generate`: writes generated output; network requires approval unless explicitly allowed; publish denied.
- `publish`: writes and network are allowed when explicitly configured; publish requires approval.
- `danger-full-access`: future escape hatch; shell remains unavailable until explicitly implemented.

Approval records are persisted to `.idea2repo/approvals.jsonl` and emit request/resolve events.

## Tools

Tools have a typed `ToolSpec` with name, description, risk, schemas, and handler. Each call emits `tool.started` and `tool.completed`, writes `tool_calls.jsonl`, and checks approval policy before side effects.

Initial tool names:

- `artifact.read`
- `artifact.write`
- `plan.update`
- `decision.record`
- `literature.search`
- `pdf.acquire`
- `ccf_a.score`
- `github.dry_run`
- `github.publish`

## API/SSE

SSE sends the same event object written to `trace.jsonl`:

```text
event: stage.started
data: {"type":"stage.started","run_id":"...","stage_id":"search_planning","timestamp":"..."}
```

The API may expose projections of runtime state, but those projections must be derived from the persisted plan, trace, decisions, approvals, artifacts, and run state.

