---
name: distill-commit-conventions
description: Distill commit message and contribution conventions from mature open-source projects and adapt them into a practical commit policy for the current repository. Use when asked to create, improve, audit, or enforce commit conventions; compare this repo against OSS commit history; write commit message rules; prepare CONTRIBUTING guidance; or decide whether to use Conventional Commits, prefixes, scopes, issue references, changelog wording, or release-oriented commit hygiene.
---

# Distill Commit Conventions

## Purpose

Create a repo-specific commit convention from evidence, not taste. Study mature open-source projects that match the repo's stack, community, and release style; extract patterns; then adapt only the parts that make this repo easier to review, release, and maintain.

## Workflow

### 1. Inspect this repo first

Check the local repository before looking outward:

- Current `git log --oneline --no-merges -n 50` style, if history exists.
- Existing `CONTRIBUTING.md`, `CHANGELOG.md`, release notes, PR templates, commit hooks, `commitlint`, `semantic-release`, Changesets, or similar tooling.
- Repo maturity: solo prototype, research project, library, app, CLI, service, or monorepo.
- Release needs: none yet, manual release notes, generated changelog, package publishing, or CI deployment.

Preserve useful local patterns unless they conflict with reviewability or automation.

### 2. Choose comparison projects deliberately

Use user-specified projects when provided. Otherwise pick 3-5 mature OSS repositories that are close in at least two dimensions:

- Same language/tooling.
- Similar product type, such as agent framework, research tooling, library, service, CLI, or docs-heavy repo.
- Similar collaboration model, such as small core team vs. broad contributor base.
- Similar release model, such as manual release notes vs. semantic release.

Prefer primary evidence from the repositories themselves: commit history, `CONTRIBUTING.md`, PR templates, changelog policy, release workflow, and commit lint configs. If using web sources, cite repository URLs or official docs.

### 3. Sample evidence

For each comparison repo, collect enough examples to see real patterns:

```bash
git log --no-merges --pretty=format:'%s' -n 100
git log --merges --pretty=format:'%s' -n 30
```

Also inspect policy/config files when present:

```bash
rg -n "commit|conventional|changelog|release|changeset|semantic" CONTRIBUTING.md README.md .github package.json pyproject.toml .commitlintrc* commitlint.config.* 2>/dev/null
```

Do not overfit to generated dependency-update commits, merge commits, release version bumps, or bot traffic. Separate human-authored commits from automation.

### 4. Distill patterns

For each source project, summarize:

- Subject style: imperative, sentence case, lowercase, max length, punctuation.
- Prefix style: Conventional Commits, subsystem prefix, plain English, emoji, ticket id, or mixed.
- Scope behavior: component name, package name, feature area, omitted when obvious.
- Body usage: when bodies are expected, how they explain rationale and tradeoffs.
- Footer usage: issue closing, breaking changes, co-authors, signed-off-by.
- Merge/squash behavior: whether final history is PR-title driven.
- Release relationship: whether commit types drive changelog, semver, or deployment.
- Enforcement: docs only, review culture, commit hook, CI check, or release tool.

Then identify the norm behind the syntax. For example, `feat(parser): ...` is not valuable by itself; it is valuable if changelog automation or scoped review benefits from it.

### 5. Adapt to this repo

Recommend the lightest convention that supports the repo's real needs:

- Prototype/research repo: prefer readable prefixes and evidence-rich bodies over strict automation.
- Library/CLI/package: prefer Conventional Commits if changelog or semver automation is likely.
- Monorepo: use scopes consistently and define valid scopes.
- Docs-heavy repo: allow `docs:` and `research:`/`notes:` if those are first-class work products.
- Public contributor repo: document examples and enforcement clearly.

Avoid heavy process when there is no release automation or broad contributor base.

## Output Contract

When asked to produce the convention, write a concise policy with these sections:

1. `Evidence Summary`: comparison projects, sampled artifacts, and observed patterns.
2. `Recommended Convention`: exact subject format, allowed types/scopes, body/footer rules.
3. `Examples`: good and bad commit messages tailored to this repo.
4. `Adoption Plan`: what to document now, what to automate later, and migration advice.
5. `Open Questions`: only unresolved decisions that materially affect the rule.

If writing files, prefer one of:

- `docs/commit-convention.md` for a standalone policy.
- `CONTRIBUTING.md` if the repo already uses contributor docs.
- Commit hook or lint config only when the user asks for enforcement or the repo already has related tooling.

## Recommended Defaults

If this repo has little history and no release automation, start with:

```text
<type>(optional-scope): <imperative summary>

Optional body explaining why the change is needed, notable tradeoffs, and validation.
Optional footer with issue references or breaking-change notes.
```

Use these initial types:

- `feat`: user-visible feature or capability.
- `fix`: bug fix or corrected behavior.
- `docs`: documentation-only change.
- `refactor`: behavior-preserving code restructuring.
- `test`: test-only change.
- `chore`: maintenance, tooling, dependencies, or repo hygiene.
- `research`: research notes, analysis artifacts, survey output, or experiment planning.

Subject rules:

- Use imperative mood when natural: `add`, `fix`, `document`, `extract`.
- Keep the subject under 72 characters when practical.
- Do not end the subject with a period.
- Use a body for non-obvious rationale, risk, or validation.

Do not require issue IDs, ticket numbers, or signed-off-by footers unless the repo already needs them.

## Quality Bar

The final convention should be:

- Evidence-backed: name which OSS patterns were adopted or rejected.
- Minimal: every rule should support review, search, release, or onboarding.
- Local: include repo-specific types/scopes rather than generic boilerplate.
- Actionable: a contributor can write a valid commit without guessing.
