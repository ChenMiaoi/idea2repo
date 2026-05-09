# Mature Codebase Audit Rubric

Use this rubric when performing a broad codebase health audit. It is a checklist for investigation, not a scoring system. Report only issues supported by repository evidence.

## 1. Stale Legacy Code

Signals:

- Compatibility branches for versions, platforms, APIs, or migrations no longer supported.
- TODO/FIXME comments older than the surrounding architecture.
- Deprecated helpers still exported from public modules.
- Feature flags with only one active value.
- Code reachable only from tests or examples.
- Docs that reference removed commands, paths, config keys, or behavior.

Useful searches:

```bash
rg -n "deprecated|legacy|compat|migration|shim|TODO|FIXME|HACK|temporary|remove|cleanup|old|v1|v2"
rg -n "feature.?flag|enable_|disable_|experimental|beta"
```

Validation:

- Confirm whether callers still exist.
- Check release notes or roadmap before recommending removal.
- Separate public compatibility from accidental leftovers.

## 2. Redundant Paths and Parallel Implementations

Signals:

- Multiple commands, APIs, routes, services, or helpers doing the same job.
- Old and new implementations both wired into production.
- Alternate config loading paths with different precedence.
- Duplicate request/response types in separate modules.
- UI and backend validations that drift.

Useful searches:

```bash
rg -n "adapter|bridge|fallback|alternate|new_|old_|v2|compat|proxy"
rg -n "parse.*config|load.*config|validate|normalize|serialize|deserialize"
```

Validation:

- Compare call sites and behavior, not just names.
- Check if redundancy is intentional, such as strategy pattern or platform split.
- Identify which path should become canonical.

## 3. Logic Inconsistencies

Signals:

- Different defaults for the same setting.
- One path validates input while another accepts it silently.
- Error behavior differs between CLI/API/UI for the same operation.
- Cache invalidation differs from mutation behavior.
- Docs describe a contract that code does not enforce.
- Tests assert behavior that contradicts production code.

Investigation steps:

- Trace the same concept from config to runtime to output.
- Compare schema definitions, validators, defaults, and docs.
- Look for duplicated constants and string literals.

Report shape:

- State the invariant that should be true.
- Show the two or more places where it diverges.
- Explain the concrete failure mode.

## 4. Hardcoded Values and Environment Assumptions

Signals:

- Fixed URLs, ports, model names, regions, cloud provider names, local paths, or credentials-like strings.
- Magic numbers for limits, timeout, retry count, concurrency, pagination, token budget, memory, or batch size.
- Timezone, locale, date format, OS, shell, or filesystem assumptions.
- Test-only values leaking into production paths.

Useful searches:

```bash
rg -n "localhost|127\\.0\\.0\\.1|http://|https://|/tmp|/Users|C:\\\\|PORT|TIMEOUT|RETRY|LIMIT|MAX_|MIN_|sleep\\(|setTimeout"
rg -n "[0-9]{3,}|86400|3600|1000|30000|60000"
```

Validation:

- Do not flag every literal. Flag values that encode policy, environment, security, or future variability.
- Prefer centralization only when the value has multiple consumers or real tuning needs.

## 5. Code Bloat and Unnecessary Abstraction

Signals:

- Helpers that wrap one line without adding domain meaning.
- Generic factories or registries with one implementation.
- Over-configurable APIs with unused options.
- Deep class hierarchies or indirection in a small code path.
- "Manager", "service", "util", or "common" modules containing unrelated responsibilities.

Validation:

- Show the added indirection and what behavior it hides.
- Check whether planned work needs the abstraction.
- Recommend deletion only when simplification keeps behavior equivalent.

## 6. Fallback, Bridge, and Compatibility Layers

Signals:

- Broad exception handlers that silently continue.
- Fallback paths that hide configuration errors.
- Bridges between old/new APIs after migration appears complete.
- Adapter layers whose source or target no longer exists.
- Retry/fallback logic without observability.

Useful searches:

```bash
rg -n "try|catch|except|fallback|default|ignore|pass|continue|bridge|adapter|shim|polyfill"
rg -n "console\\.warn|logger\\.warn|logger\\.error|print\\("
```

Validation:

- Distinguish resilience from masking failures.
- Verify whether fallback changes observable behavior.
- Check whether users can detect the fallback occurred.

## 7. Duplicate Code and Drift Risk

Signals:

- Copy-pasted functions with small variations.
- Repeated schemas, enum values, route names, command names, or constants.
- Generated and source files both edited manually.
- Frontend/backend or client/server types maintained separately without generation.

Validation:

- Identify the shared concept.
- Show the divergence risk or existing mismatch.
- Prefer one source of truth over broad refactor advice.

## 8. Future Bug Predictors

Signals:

- Race-prone shared mutable state.
- Unbounded queues, caches, logs, retries, or file reads.
- Missing cleanup for timers, sockets, temp files, subprocesses, or handles.
- Partial failure paths that leave persistent state inconsistent.
- Date/time logic without timezone clarity.
- Assumptions about ordering, uniqueness, idempotency, or exactly-once behavior.

Validation:

- Explain the triggering condition.
- Identify likely user impact.
- Recommend a targeted guard, test, or invariant.

## 9. Future Plan Conflicts

Signals:

- Implementation contradicts `docs/`, roadmap, TODOs, branch naming, issue templates, or stated architecture.
- Current module boundary blocks planned extension.
- Data model makes a planned feature hard or ambiguous.
- Temporary path became a hidden dependency.

Useful searches:

```bash
find . -maxdepth 4 -type f \( -iname '*plan*' -o -iname '*roadmap*' -o -iname '*architecture*' -o -iname 'README*' -o -iname 'CONTRIBUTING*' \)
rg -n "will|planned|future|next|roadmap|phase|MVP|v0|v1|TODO|later|temporary" docs README* .github 2>/dev/null
```

Validation:

- Quote the plan or point to the file.
- Explain the conflict in implementation terms.
- Separate speculative future work from documented direction.

## 10. Internal Standards Conflicts

Signals:

- File naming, error handling, dependency injection, logging, test style, or formatting differ from local norms.
- New code bypasses established helper APIs.
- Tests use different setup patterns than the rest of the suite.
- Security, privacy, or safety conventions are inconsistently applied.

Validation:

- Establish the local standard from existing code or explicit docs.
- Cite at least one local precedent when possible.
- Avoid importing external style preferences unless the repo already signals them.

## 11. Audit Evidence Commands

Use these when appropriate:

```bash
git status --short
git log --oneline --decorate -n 30
rg --files
rg -n "TODO|FIXME|HACK|deprecated|legacy|fallback|bridge|adapter|hardcoded|temporary|remove|cleanup"
rg -n "process\\.env|os\\.environ|ENV|config|settings|default|timeout|retry|limit"
rg -n "throw|raise|catch|except|panic|unwrap|assert|return null|return undefined"
```

For languages with native tooling, prefer project tools:

- JavaScript/TypeScript: `npm test`, `npm run lint`, `npm run typecheck`, `tsc --noEmit`, dependency graph tools if already present.
- Python: `pytest`, `ruff`, `mypy`, import graph checks if already present.
- Go: `go test ./...`, `go vet ./...`.
- Rust: `cargo test`, `cargo clippy`.

Only run broad commands when they are reasonable for the repository size and environment.

## 12. Reporting Discipline

For each finding, include:

- Priority.
- Exact file and line.
- The violated invariant or maintainability principle.
- The concrete consequence.
- The smallest credible remediation.
- Confidence level.

Do not include:

- Large speculative refactors without a specific failure mode.
- Pure preference complaints.
- Findings against generated/vendor code unless it affects source ownership.
- Issues that are already clearly planned and harmless unless the current state blocks work.
