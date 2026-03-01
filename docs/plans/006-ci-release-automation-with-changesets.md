# CI Release Automation with Changesets

- `id`: `006-ci-release-automation-with-changesets`
- `status`: `completed`
- `owners`: `openclaw-1p-sdk-resolver maintainers`
- `created`: `2026-03-01`
- `updated`: `2026-03-01`
- `related-issues`: `[]`
- `related-prs`: `[]`

## Summary

Introduce CI-driven npm release automation using [Changesets](https://github.com/changesets/changesets) so releases are produced from [GitHub Actions](https://docs.github.com/actions) rather than maintainer workstations.

## Scope

### In scope

- Add [Changesets](https://github.com/changesets/changesets) configuration and CLI tooling.
- Add [GitHub Actions](https://docs.github.com/actions) release workflow that creates release PRs and publishes from CI.
- Document maintainer and contributor release flow in repository documentation.

### Out of scope

- Runtime resolver behavior changes.
- CLI command/flag/output contract changes.
- OpenClaw integration behavior changes.
- Alternative release automation platforms (for example [semantic-release](https://semantic-release.gitbook.io/semantic-release/)).

## Public Interface Impact

None. Package runtime APIs/CLI contracts are unchanged. Release operations and maintainer workflow are updated.

## Implementation Steps

1. Add `@changesets/cli` and release scripts to `package.json`.
2. Add `.changeset/config.json` for repository release policy.
3. Add `.github/workflows/release.yml` to run release PR/publish automation.
4. Document release process and one-time maintainer setup in `README.md`.
5. Validate with `pnpm build` and `pnpm test`.

## Tests and Acceptance Criteria

### Tests

- `pnpm build`
- `pnpm test`

### Acceptance Criteria

- Repository contains Changesets config and scripts.
- Release workflow can open/update release PRs on `main`.
- Publish path is CI-based and configured for [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) setup.
- Build and test pass after workflow/tooling additions.

## Assumptions and Defaults

- Repository remains single-package for release orchestration.
- Release automation targets branch `main`.
- Trusted publishing is configured in npm package settings by maintainers.

## Rollout and Compatibility Notes

- Existing manual release practices can be retired after trusted publishing is enabled.
- Contributor workflow now expects `.changeset/*.md` in release-affecting PRs.
- Versioning behavior continues to follow [Semantic Versioning](https://semver.org/).
