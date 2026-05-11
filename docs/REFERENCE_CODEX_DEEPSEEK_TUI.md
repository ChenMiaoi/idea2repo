# Reference Mapping: Codex CLI And DeepSeek-TUI

Idea2Repo borrows runtime patterns from Codex CLI and DeepSeek-TUI while keeping a narrower research-builder scope.

## Codex CLI References

- Full-screen terminal UI inspires the TUI runtime cockpit with transcript, plan, artifact, details, and approval areas.
- Plan-first execution inspires visible plan updates before and during research stages.
- Inline approval modes inspire Idea2Repo runtime modes and approval boundaries.
- Session resume inspires persisted trace, plan history, decision records, and approvals.
- `codex exec` inspires the `openai-codex-cli` provider adapter for non-interactive structured calls.
- Multi-entry runtime behavior inspires sharing the same contract across CLI, TUI, API, and Web.

## DeepSeek-TUI References

- Plan/Agent/YOLO modes inspire Idea2Repo `plan`, `generate`, `publish`, and future high-trust modes.
- Typed tool registry inspires `ToolSpec`, risk metadata, tool events, and tool result logs.
- Streaming transcript and reasoning blocks inspire visible reasoning summaries, not raw chain-of-thought.
- Durable session save/resume inspires `.idea2repo/trace.jsonl`, plan persistence, and stage recovery.
- HTTP/SSE runtime API inspires `/runs/:id/events`.
- Workspace rollback inspires Idea2Repo artifact-level snapshots before broader workspace rollback.
- Lazy tool discovery inspires a small registry that can grow without coupling every pipeline function directly to the UI.

## Idea2Repo-Specific Constraints

- Do not implement arbitrary shell execution as part of this roadmap.
- Do not expose raw chain-of-thought.
- Do not publish without explicit approval.
- Do not fabricate papers, datasets, baselines, metrics, or evidence.
- Keep deterministic offline tests as the primary quality gate before relying on external providers.

