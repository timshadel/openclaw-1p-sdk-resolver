# CI Release Automation with Changesets and Trusted Publishing

- `id`: `014-ci-release-automation-with-changesets-and-trusted-publishing`
- `status`: `accepted`
- `date`: `2026-03-01`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["contributors", "operators"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

Release publication was previously oriented around manual maintainer actions.
This repository now has accepted CI/security governance (ADR `013`) that explicitly includes Phase 2 supply-chain hardening and trusted publishing with provenance.
Without a durable architecture decision, release behavior and trust posture can drift across workflows and maintainer practices.

## Decision

1. Release orchestration is CI-driven from `main` via GitHub Actions.
2. Changesets is the release coordinator:
   - release PR generation for pending changesets,
   - npm publish when releasable changes are already present on `main`.
3. npm publishing is performed from CI using trusted publishing (OIDC) and provenance metadata.
4. Release automation is standardized in repository-owned workflow and package scripts, not per-maintainer local conventions.

## Consequences

- Positive:
  - Reduces reliance on maintainer workstation state for publishing.
  - Improves supply-chain posture with CI identity and provenance.
  - Makes version/changelog flow explicit and reviewable through release PRs.
- Tradeoffs:
  - Adds workflow and bot automation complexity.
  - Requires contributors to include changesets for releasable changes.
  - Requires one-time npm trusted publisher configuration by maintainers.

## Alternatives considered

1. Continue manual publish from maintainer machines.
   - Rejected: inconsistent release controls and weaker supply-chain guarantees.
2. Keep tag/release-event-only publishing without release PR orchestration.
   - Rejected: weaker change visibility and poorer incremental release hygiene.
3. Adopt a different release orchestrator immediately (for example semantic-release).
   - Rejected: unnecessary migration cost; Changesets satisfies current needs.

## References

- Plans:
  - [006-ci-release-automation-with-changesets.md](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/plans/006-ci-release-automation-with-changesets.md)
- PRs:
  - [PR #12](https://github.com/timshadel/openclaw-1p-sdk-resolver/pull/12)
- Commits:
  - `22daffd`
  - `18e67b3`
- Docs:
  - [013-ci-security-and-ai-review-governance.md](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/adrs/013-ci-security-and-ai-review-governance.md)
  - [release.yml](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/.github/workflows/release.yml)
  - [README.md](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/README.md)
