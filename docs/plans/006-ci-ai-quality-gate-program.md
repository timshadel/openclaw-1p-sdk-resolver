# CI + AI Quality Gate Program

- `id`: `006-ci-ai-quality-gate-program`
- `status`: `completed`
- `owners`: `openclaw-1p-sdk-resolver maintainers`
- `created`: `2026-03-01`
- `updated`: `2026-03-01`
- `related-issues`: `[]`
- `related-prs`: `[]`

## Summary

Establish a phased GitHub-first quality gate program, informed by PR feedback and local AI sessions, that catches coverage regressions, docs/CLI drift, code-comment/README consistency drift, workflow correctness issues, and security supply-chain risks earlier in PRs while keeping AI review advisory-only.

## Scope

### In scope

- Add CI workflows for test/coverage, docs checks, workflow lint, CodeQL, and Scorecard.
- Add helper scripts for coverage thresholds/regression detection, README/help sync checks, docs/comment consistency checks, and plan/ADR governance checks.
- Add governance artifacts and docs for required checks and rollout phases.
- Add Dependabot and CODEOWNERS baselines.

### Out of scope

- Automating GitHub branch ruleset changes via API.
- Enforcing AI review as merge-blocking approval.
- Runtime resolver protocol/CLI contract changes.

## Public Interface Impact

None for runtime resolver behavior.

Repository contribution interface changes:

- New CI status check names become the stable quality interface:
  - `ci/test`
  - `ci/coverage`
  - `ci/docs`
  - `ci/workflow-lint`
  - `security/dependency-review`
  - `security/codeql`
  - `security/scorecard` (advisory)

## Implementation Steps

1. Add plan/ADR governance records for CI and AI review policy.
2. Add scripts:
   - `scripts/check-coverage-thresholds.mjs`
   - `scripts/check-readme-help-sync.mjs`
   - `scripts/check-doc-comment-consistency.mjs`
   - `scripts/check-plan-adr-required.mjs`
3. Add CI workflows:
   - update `ci.yml`
   - update `dependency-review.yml`
   - add `docs.yml`, `workflow-lint.yml`, `codeql.yml`, `scorecard.yml`, `release.yml`
4. Add `.github/dependabot.yml` and `.github/CODEOWNERS`.
5. Add docs:
   - `docs/ci/quality-gates.md`
   - AGENTS CI section and preflight commands
6. Validate with local test/coverage and script execution.

## Tests and Acceptance Criteria

### Tests

- `pnpm test`
- `pnpm test:coverage`
- `pnpm check:coverage`
- `pnpm check:docs`
- `pnpm check:governance`

### Acceptance Criteria

- Coverage threshold and regression script runs in CI and produces actionable output.
- README/CLI command drift is detectable in CI.
- Architecture documentation and source-header comment anchors remain consistent in CI.
- Plan/ADR policy violations on public/architecture-sensitive changes are surfaced in CI.
- CodeQL and dependency review run for PRs/default branch.
- Scorecard runs on schedule in advisory mode.

## Assumptions and Defaults

- Rollout mode starts in `observe` (warn-only) for newly introduced gates.
- Coverage minima are line `>= 93%` and branch `>= 90%`.
- AI review remains advisory and does not replace human approval.
- GitHub-hosted runners and pinned action majors are acceptable baseline.

## Rollout and Compatibility Notes

- Phase 0 uses warn-only mode in non-critical jobs/steps to build baseline without blocking active work.
- Phase 1 promotes selected checks to required in branch rulesets.
- Phase 2 extends supply-chain hardening with trusted npm publishing provenance and scheduled security posture checks.
