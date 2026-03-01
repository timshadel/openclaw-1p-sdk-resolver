# Intentional Release Gating and Manual Dispatch

- `id`: `016-intentional-release-gating-and-manual-dispatch`
- `status`: `accepted`
- `date`: `2026-03-01`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["contributors", "operators"]`
- `supersedes`: `014-ci-release-automation-with-changesets-and-trusted-publishing`
- `superseded-by`: `""`

## Context

The repository previously moved to CI-driven release orchestration from merge events on `main`.
Maintainer preference is to batch releases and publish only through explicit, intentional operator actions rather than every merge.
This requires changing the release trigger model while preserving trusted publishing and Changesets-based version/changelog flow.

## Decision

1. Release automation remains CI-based, but is manually triggered via `workflow_dispatch`.
2. Release operations are split by intent:
   - prepare mode: open/update release PR content via Changesets.
   - publish mode: publish to npm from `main` only.
3. Merge to `main` does not automatically attempt release preparation or publishing.
4. Trusted publishing and provenance remain required for publish operations.

## Consequences

- Positive:
  - Maintainers control release timing and can batch multiple merges.
  - Release actions are explicit and auditable.
  - Retains CI-based security posture for publication.
- Tradeoffs:
  - Releases require additional maintainer interaction.
  - Delays between merge and publish are expected.
  - Operators must run the correct mode in sequence.

## Alternatives considered

1. Continue auto-on-merge release behavior.
   - Rejected: does not meet intentional batching requirement.
2. Return to local/manual workstation publish.
   - Rejected: weaker consistency and supply-chain posture.
3. Use tag-only release publishing while keeping no prepare mode.
   - Rejected: weaker structured version/changelog prep compared with Changesets release PRs.

## References

- Plans:
  - [007-intentional-release-train-manual-dispatch.md](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/plans/007-intentional-release-train-manual-dispatch.md)
- PRs:
  - pending
- Commits:
  - pending
- Docs:
  - [014-ci-release-automation-with-changesets-and-trusted-publishing.md](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/adrs/014-ci-release-automation-with-changesets-and-trusted-publishing.md)
  - [release.yml](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/.github/workflows/release.yml)
