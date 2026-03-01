# CI, Security, and AI Review Governance

- `id`: `013-ci-security-and-ai-review-governance`
- `status`: `accepted`
- `date`: `2026-03-01`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["contributors", "operators"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

Late-stage PR feedback repeatedly identified regressions that were technically detectable earlier (coverage drops, docs drift, workflow quality gaps, and governance drift). Existing CI only ran build/test and dependency review, which was insufficient for policy-driven quality goals in accepted ADR `010` and safety boundaries in ADR `012`.

## Decision

1. Standardize a stable CI check interface for this repository:
   - `ci/test`
   - `ci/coverage`
   - `ci/docs`
   - `ci/workflow-lint`
   - `security/dependency-review`
   - `security/codeql`
   - `security/scorecard` (advisory)
2. Enforce phased rollout:
   - Phase 0 observe mode (warn-only) for new checks.
   - Phase 1 required checks via branch rulesets.
   - Phase 2 supply-chain hardening (trusted publishing + provenance, scheduled posture checks).
3. Keep AI review advisory-only:
   - AI comments can guide reviewers.
   - AI outputs do not satisfy required human approvals.
4. Require machine-checkable plan/ADR governance checks for sensitive change scopes.

## Consequences

- Positive:
  - Earlier detection of regressions and policy drift.
  - Clear contribution contract with deterministic CI outcomes.
  - Better security/supply-chain posture for public package distribution.
- Tradeoffs:
  - Additional CI maintenance and occasional false-positive tuning.
  - Slightly longer PR feedback cycle due to added checks.

## Alternatives considered

1. Keep current minimal CI and rely on manual review.
   - Rejected: repeated late findings showed insufficient early signal.
2. Adopt third-party paid CI quality platform as a hard dependency.
   - Rejected: unnecessary coupling; GitHub-native baseline is sufficient.
3. Make AI review blocking for merges.
   - Rejected: human accountability must remain the merge gate.

## References

- Plans:
  - `/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/plans/006-ci-ai-quality-gate-program.md`
- PRs:
  - pending
- Commits:
  - pending
- Docs:
  - `/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/adrs/010-quality-gates-and-coverage-policy.md`
  - `/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/adrs/012-resolver-security-boundary-and-invariants.md`
