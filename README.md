# Idea2Repo

Idea2Repo turns an early research idea into a local-first CCF-A readiness repository: strict diagnosis reports, evidence-gated scores, verified literature artifacts, execution plans, paper skeletons, and reproducible project scaffolds.

It is intentionally artifact-first. Offline or failed-network runs create traceable search tasks and placeholders instead of fabricated papers, citations, experimental results, or acceptance claims.

## Design Baselines

The task model follows the public shape of local coding agents:

- [OpenAI Codex CLI](https://github.com/openai/codex): local terminal agent, workspace-aware execution, and CLI-first developer workflow.
- [Running Codex safely](https://openai.com/index/running-codex-safely/): isolation, explicit approvals, and a cautious boundary around code execution.
- [Claude Code permissions](https://code.claude.com/docs/en/permissions): deny-first permissions for file, network, install, and publish actions.
- [Claude Code settings/subagents](https://code.claude.com/docs/en/settings): project settings, resumable context, and specialized agent roles.

Idea2Repo adapts those patterns for research work: one idea becomes one resumable repo with manifests, run logs, evidence matrices, provider rules, and publish guardrails.

## Install

From the repository root:

```bash
uv tool install --editable .
```

Then start the CLI from anywhere:

```bash
idea2repo
```

To reinstall after dependency or entrypoint changes:

```bash
uv tool install --force --editable .
```

## Quick Start

Start the Codex-style interactive CLI:

```bash
uv run idea2repo
```

On first run, Idea2Repo checks its own OpenAI/Codex OAuth login under `~/.idea2repo`. If you are not logged in, it prompts you to complete a browser OAuth flow. After login, it asks for your research idea and then guides you through domain, timeline, resources, and output directory:

```text
Research idea >
Target domain [auto] >
Timeline weeks [12] >
Resources [none] >
Output directory [generated_repos/...]
```

Interactive slash commands are intentionally small:

```text
/help
/logout
/status
/exit
```

Idea2Repo does not read `~/.codex` auth files or browser cookies. It stores OAuth metadata and credentials under `~/.idea2repo/agent/codex`, and generated repos contain only non-sensitive generation metadata.

## Advanced / Automation

Scripted generation remains available for CI and repeatable workflows.

Cross-shell single-line form:

```bash
uv run idea2repo generate "LLM agents need long-term memory compression" --domain "AI/LLM Agent" --weeks 12 --resource single-researcher --resource no-gpu --output generated_repos/demo
```

Use `--offline` to force the deterministic fallback instead of calling the OAuth Codex responses provider. Use `--provider openai-codex-cli` to explicitly route through the official Codex CLI wrapper.

PowerShell multi-line form:

```powershell
uv run idea2repo generate "LLM agents need long-term memory compression" `
  --domain "AI/LLM Agent" `
  --weeks 12 `
  --resource single-researcher `
  --resource no-gpu `
  --output generated_repos/demo
```

macOS/Linux shell multi-line form:

```bash
uv run idea2repo generate "LLM agents need long-term memory compression" \
  --domain "AI/LLM Agent" \
  --weeks 12 \
  --resource single-researcher \
  --resource no-gpu \
  --output generated_repos/demo
```

Useful CLI commands:

```bash
uv run idea2repo status --output generated_repos/demo
uv run idea2repo validate --output generated_repos/demo
uv run idea2repo resume --output generated_repos/demo
uv run idea2repo doctor
uv run idea2repo auth status
uv run idea2repo provider list
uv run idea2repo venues validate
uv run idea2repo provider show
uv run idea2repo github dry-run --output generated_repos/demo
```

## Generated Repo

The generated project includes:

- `docs/diagnosis/ccf_a_readiness_report.md`
- raw idea score, revised plan score, and evidence gate artifacts
- verified literature records, BibTeX, related-work matrix, and claim-evidence matrix
- survey, workflow, execution plan, runtime, provider, and meeting notes
- defensive security guardrail reports for dual-use ideas
- Python/uv research scaffold by default, or TypeScript/npm via `--stack ts`
- paper LaTeX skeleton, experiment directories, CI templates, Docker files, result logger, and GitHub issue templates

Use `--weeks 8`, `--weeks 12`, `--weeks 16`, or `--weeks 24` to choose the execution timeline. Add `--resource` repeatedly to capture constraints such as `single-researcher`, `gpu`, `no-gpu`, `real-data`, or `no-real-data`.

Use `--force` only when intentionally regenerating into a non-empty output directory.

## Web And API

Run the FastAPI backend:

```bash
uv run uvicorn idea2repo.api:create_app --factory --host 127.0.0.1 --port 8000
```

Run the React/Vite dashboard:

```bash
cd web
npm install
npm run dev
```

The API exposes generate/status/resume/validate, artifact tree/read, literature search, scoring, reviewer simulation, rebuttal planning, provider settings, and GitHub dry-run endpoints.

## Permission Model

Idea2Repo allows new local artifact writes by default so `generate` can create a repo. Risky side effects remain deny-first and require explicit flags or policy settings:

- overwrite existing outputs with `--force`
- network access for literature refresh/search with `--allow-network`
- login/provider flows with `--allow-login`
- dependency installation with `--allow-install`
- GitHub publish or any external side effect with `--allow-publish`

Dry-run paths are preferred. GitHub export previews issue payloads by default; publishing requires `--allow-publish` and uses an isolated scanned temporary tree so local `.git` state, secrets, binary artifacts, and ignored research outputs are not pushed.

## Provider Rules

The default provider is `openai-codex-oauth` with API shape `openai-codex-responses`: Idea2Repo performs its own OpenAI/Codex OAuth login, stores credentials under `~/.idea2repo/agent/codex/credentials.json`, calls the experimental Codex responses backend, and validates the final message against its `ResearchAnalysis` schema.

`openai-codex-cli` remains available as an explicit provider, and the deterministic `offline` provider is available only through `--offline` or `--provider offline`. Codex or schema failures stop generation instead of silently falling back.

The generated manifest records `analysis_source`, `provider_id`, `api_shape`, Codex model/version when available, schema version, and fallback reason. It never records tokens, Authorization headers, OAuth file paths, or private provider responses.

## Literature Policy

No-key public connectors cover DBLP, OpenAlex, Crossref, and arXiv. Semantic Scholar or paid/keyed sources can be added later through explicit provider configuration.

Every paper artifact must be traceable by source URL and identifier when available. If a source is offline or unavailable, the workflow emits search tasks instead of inventing citations, BibTeX, baselines, or datasets.

## Security Boundary

Security ideas are routed through a dual-use guardrail. Defensive work such as threat modeling, evaluation design, detection, audit plans, and responsible disclosure templates is allowed. The generator blocks or downgrades content that would create executable attack chains, credential theft, malware, exploit instructions, or real-target abuse.

## GitHub Export

Preview export payloads:

```bash
uv run idea2repo github dry-run --output generated_repos/demo --repo-name demo-research
```

Publish with `gh` only after explicit permission:

```bash
uv run idea2repo github publish --output generated_repos/demo --repo-name demo-research --allow-publish
```

Publishing scans text files, skips symlinks, ignores local-sensitive paths and large artifacts, rejects secret-like content, commits only copied publishable files in a temporary tree, and creates issues from generated TODO/milestone artifacts.

## Development

Python uses `uv`; web uses `npm`.

```bash
uv run python -m unittest discover -s tests
cd web
npm install
npm run typecheck
npm test
npm run build
```

Generated repo smoke behavior is covered by the Python test suite, including paths with spaces and Chinese text, manifest validation, permission denials, evidence gates, guardrails, mocked literature providers, and mocked GitHub publish flows.
