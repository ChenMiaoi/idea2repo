---
name: audit-codebase-health
description: Perform a mature-project codebase health audit to find stale legacy code, redundant paths, logic inconsistencies, hardcoded values, code bloat, unnecessary helpers, fallback layers, bridge code, duplicate implementations, likely future bugs, conflicts with future implementation plans, conflicts with internal coding standards, and other maintainability risks. Use when asked to analyze, review, audit, clean up, simplify, de-risk, or find concerning code without immediately implementing fixes.
---

# Audit Codebase Health

## Purpose

Run an evidence-first maintainability audit. Treat the repository like a mature production project: understand intent, map architecture, identify risk, and report findings with file/line evidence, impact, confidence, and a practical remediation path.

For a broad audit, read `references/audit-rubric.md` after this file. For a narrow user request, load only the relevant rubric sections.

## Operating Principles

- Do not rewrite code during the audit unless the user explicitly asks for fixes.
- Prefer concrete findings over style opinions. Each finding should include evidence and why it matters.
- Distinguish proven issues from suspicious patterns that need confirmation.
- Respect existing user changes. Do not revert or normalize unrelated files.
- Optimize for mature-project maintainability: fewer paths, fewer hidden contracts, clearer ownership, stronger invariants.

## Audit Workflow

### 1. Establish context

Inspect the repository before judging it:

```bash
git status --short
rg --files
find . -maxdepth 3 -type f \( -name 'README*' -o -name 'CONTRIBUTING*' -o -name 'ARCHITECTURE*' -o -name 'ROADMAP*' -o -name '*plan*' \)
```

Identify:

- Main languages, frameworks, package managers, and test runners.
- Entry points, public APIs, commands, background jobs, and generated code.
- Existing coding standards, roadmap docs, implementation plans, or architectural notes.
- Dirty worktree files that should be treated as user-owned changes.

### 2. Build a dependency and ownership map

Use static evidence to understand shape before diving into details:

- Directory/module responsibilities.
- Import and call direction.
- Shared helpers, adapters, bridges, fallback paths, and compatibility layers.
- Duplicated concepts with different names.
- Dead-looking code that still has external entry points.

Prefer `rg`, language-native tooling, and package metadata over guesses.

### 3. Hunt by risk category

Work category by category, not file by file. Cover at least:

- Stale legacy code: old compatibility, unused flags, deprecated APIs, abandoned TODOs.
- Redundant paths: two ways to do the same thing, shadow workflows, unused alternate implementations.
- Logic inconsistencies: validation differences, mismatched defaults, divergent error handling, contradictory invariants.
- Hardcoded values: URLs, paths, model names, ports, secrets-like values, timeouts, limits, environment assumptions.
- Code bloat: abstraction without leverage, helper layers that obscure behavior, inflated configuration.
- Unnecessary fallback/bridge code: broad catches, silent fallbacks, migration shims with no current caller.
- Duplication: copied logic, repeated schemas, parallel config parsing, repeated UI or API states.
- Future bugs: edge cases, concurrency hazards, stale caches, resource leaks, flaky timing, schema drift.
- Plan conflicts: current code that contradicts roadmap, docs, TODO direction, or likely next implementation.
- Standards conflicts: repo conventions, internal style, safety, security, testing, or release expectations.

Use `references/audit-rubric.md` for detailed signals and search patterns.

### 4. Validate likely findings

Before reporting, verify each candidate:

- Find all call sites and reachable entry points.
- Check tests, docs, config, CI, and generated outputs.
- Run focused tests or static checks when available and cheap.
- Look for historical intent with `git log -- <path>` when useful.
- Mark confidence explicitly when runtime behavior cannot be proven locally.

Do not report a finding solely because code looks unfamiliar.

### 5. Report in review format

Lead with findings, ordered by severity:

```markdown
## Findings

- [P1] Title
  Evidence: `path/to/file.ext:123`
  Issue: What is wrong and why it matters.
  Impact: User-visible bug, maintenance risk, release blocker, security risk, or future implementation conflict.
  Recommendation: Minimal remediation path.
  Confidence: High/Medium/Low.

## Open Questions

- Questions that materially affect whether a finding is valid.

## Audit Coverage

- Files/areas inspected.
- Commands/tests run.
- Areas not inspected and residual risk.
```

Severity guide:

- `P0`: breaks core behavior, data safety, security boundary, or release immediately.
- `P1`: likely bug, serious maintainability trap, or near-term implementation blocker.
- `P2`: meaningful cleanup, duplication, confusing fallback, or hardcoded assumption with plausible future cost.
- `P3`: minor consistency issue or optional simplification.

## Mature-Project Quality Bar

A good audit should make maintainers say one of:

- "This can fail in production or block the next planned change."
- "This duplicates a concept and will make future changes diverge."
- "This path exists only because of historical accident and should be retired."
- "This rule should be documented or enforced because the code already depends on it."

Avoid vague conclusions such as "could be cleaner" unless paired with concrete code evidence and a specific payoff.
