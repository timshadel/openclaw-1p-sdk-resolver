# Intentional Release Train via Manual Dispatch

- `id`: `007-intentional-release-train-manual-dispatch`
- `status`: `completed`
- `owners`: `openclaw-1p-sdk-resolver maintainers`
- `created`: `2026-03-01`
- `updated`: `2026-03-01`
- `related-issues`: `[]`
- `related-prs`: `[]`

## Summary

Change release orchestration from auto-on-merge to intentionally triggered manual dispatch so maintainers can batch changes and publish only when explicitly requested.

## Scope

### In scope

- Replace push-to-main release triggering with `workflow_dispatch`.
- Support explicit "prepare release PR" and "publish" operations.
- Update release documentation for maintainers/contributors.
- Record architecture decision updates in ADRs.

### Out of scope

- Runtime resolver behavior changes.
- CLI contract/schema changes.
- Package naming/distribution target changes.

## Public Interface Impact

No runtime API/CLI output changes. Maintainer operational workflow changes:

- Releases are no longer attempted on every merge to `main`.
- Maintainers intentionally trigger release preparation and publish actions.

## Implementation Steps

1. Replace `.github/workflows/release.yml` push trigger with manual dispatch and explicit mode inputs.
2. Implement guarded `prepare` mode that opens/updates release PRs but does not publish.
3. Implement guarded `publish` mode that publishes from `main` only with trusted publishing/provenance.
4. Update `README.md` release workflow documentation.
5. Add ADR update for intentional/manual release gating and supersede prior auto-on-merge release ADR.

## Tests and Acceptance Criteria

### Tests

- `pnpm build`
- `pnpm test`
- `pnpm ci:preflight`

### Acceptance Criteria

- No automatic release attempts are triggered by merge to `main`.
- Maintainers can manually run prepare mode to open/update a release PR.
- Maintainers can manually run publish mode from `main`.
- Governance checks pass with updated plan/ADR records.

## Assumptions and Defaults

- Maintainers trigger release workflow manually from `main`.
- npm trusted publishing remains configured for this repository.
- Contributor flow still uses Changesets in feature PRs.

## Rollout and Compatibility Notes

- Existing batch release behavior shifts to explicit maintainer actions.
- Future scheduled/recurring release trains can be added without changing this baseline manual model.
