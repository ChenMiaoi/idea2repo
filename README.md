# Idea2Repo

Idea2Repo turns an early research idea into a local-first CCF-A readiness repository: diagnosis reports, evidence-gated scores, verified literature artifacts, execution plans, paper skeletons, and reproducible project scaffolds.

The runtime is TypeScript ESM on Node >=22. The npm package and CLI binary are both named `idea2repo`.

## Install

```bash
npm install -g idea2repo
```

Or run without installing:

```bash
npx idea2repo
```

Local development:

```bash
npm install
npm run dev
```

## Quick Start

Start the Ink TUI:

```bash
idea2repo
```

Generate from a shell:

```bash
idea2repo research "LLM agents need long-term memory compression" \
  --domain "AI/LLM Agent" \
  --weeks 12 \
  --resource single-researcher \
  --resource no-gpu \
  --output generated_repos/demo
```

Use deterministic local generation without network or OAuth:

```bash
idea2repo "A benchmark for defensive agent security evaluation" --offline --output generated_repos/demo
```

## Agent Runtime Roadmap

Idea2Repo is adding an observable agent runtime with typed events, live plans, visible decision records, approval policy, tool calls, SSE run events, and artifact snapshots. See [docs/AGENT_RUNTIME_ROADMAP.md](docs/AGENT_RUNTIME_ROADMAP.md), [docs/RUNTIME_CONTRACT.md](docs/RUNTIME_CONTRACT.md), and [docs/REFERENCE_CODEX_DEEPSEEK_TUI.md](docs/REFERENCE_CODEX_DEEPSEEK_TUI.md).

Useful commands:

```bash
idea2repo status --output generated_repos/demo
idea2repo validate --output generated_repos/demo
idea2repo resume --output generated_repos/demo
idea2repo doctor
idea2repo auth status
idea2repo auth login
idea2repo auth logout
idea2repo provider list
idea2repo venues validate
idea2repo github dry-run --output generated_repos/demo
```

## Providers

The canonical Codex OAuth provider id is `openai-codex`. The legacy input `openai-codex-oauth` is accepted and recorded in generated manifests as an alias migration.

Codex OAuth credentials are stored under:

```text
~/.idea2repo/agent/codex/auth.json
```

The directory is written with `0700`, the auth file with `0600`, and refresh operations use a local lock file. Idea2Repo does not read `~/.codex` or browser cookies.

Network requests honor standard proxy environment variables: `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`, `NO_PROXY`, and their lowercase forms. On macOS, if those env vars are absent, Idea2Repo reads manual system proxy settings from `scutil --proxy` and applies HTTP/HTTPS/SOCKS proxies to Node requests. Child processes receive normalized upper/lowercase proxy variables as well.

Supported provider ids:

- `openai-codex`: Idea2Repo-managed OpenAI Codex OAuth provider.
- `openai-codex-oauth`: legacy alias for `openai-codex`.
- `openai-codex-cli`: reserved Codex CLI wrapper provider during migration.
- `offline`: deterministic fallback.

## TUI

Running `idea2repo` with no arguments starts the Ink/React TUI when stdin/stdout are TTYs. Non-TTY sessions print help and remain usable through command mode.

Slash commands include:

```text
/help
/login
/logout
/status
/model
/reasoning
/provider
/research
/output
/resume
/validate
/doctor
/github dry-run
/exit
```

## Generated Repo

Generated repositories keep manifest `version: 1`. The `generation` block now includes Node runtime and provider metadata:

- `runtime: "node"`
- `provider_id`
- `api_shape`
- `model`
- `reasoning_effort`
- optional `provider_alias_migration`

Main artifacts include diagnosis reports, evidence gates, security guardrails, related-work matrices, BibTeX placeholders, workflow notes, execution plans, paper LaTeX skeletons, CI, Docker files, GitHub issue templates, and either Python or TypeScript scaffold files via `--stack python|ts`.

## Web And API

Run the local Node API:

```bash
idea2repo api --host 127.0.0.1 --port 8000
```

Run the API and Vite dashboard together:

```bash
idea2repo web
```

The API preserves the existing REST contract: `/health`, `/generate`, `/status`, `/resume`, `/validate`, `/artifacts`, `/artifacts/read`, `/literature/search`, `/score`, `/provider/settings`, and `/github/dry-run`.

## GitHub Export

Preview export payloads:

```bash
idea2repo github dry-run --output generated_repos/demo --repo-name demo-research
```

Publish with `gh` only after explicit permission:

```bash
idea2repo github publish --output generated_repos/demo --repo-name demo-research --allow-publish
```

Publishing scans text files, skips local-sensitive paths and large artifacts, rejects secret-like content, commits copied publishable files in a temporary tree, and creates issues from generated TODO/milestone artifacts.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:integration
npm run pack:dry-run
```

Web checks are included through the root npm workspace:

```bash
npm run web:build
npm run web:test
```
