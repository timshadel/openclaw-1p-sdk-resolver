# Node Compatibility Baseline and CI Matrix Policy

- `id`: `015-node-compatibility-baseline-and-ci-matrix-policy`
- `status`: `accepted`
- `date`: `2026-03-01`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["contributors", "operators"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

Repository runtime and CI policy must align with active OpenClaw/claw runtime expectations and maintained Node lines.
Node 20 support in earlier CI configuration was unintentional and inconsistent with the intended baseline.
Without a durable policy decision, engine range and CI matrix can drift over time.

## Decision

1. Project runtime compatibility floor is `node >=22.12.0`.
2. CI test matrix covers:
   - `22.12.0` (minimum supported baseline),
   - `24.x` (active LTS line),
   - `25.x` (current modern line).
3. Node 20 is not part of the supported compatibility policy for this repository.

## Consequences

- Positive:
  - Aligns CI signals with intended production support contract.
  - Reduces ambiguity for contributors about supported Node versions.
  - Catches regressions across minimum-through-modern Node lines.
- Tradeoffs:
  - Users pinned to Node 20 must upgrade to use supported builds.
  - CI runtime matrix maintenance must track future Node lifecycle changes.

## Alternatives considered

1. Keep Node 20 in supported range and CI matrix.
   - Rejected: does not match intended baseline policy.
2. Test only a single Node major in CI.
   - Rejected: increases risk of version-specific regressions.
3. Set an unpinned floor such as `>=22` without minimum patch precision.
   - Rejected: less deterministic than explicit `22.12.0` baseline.

## References

- Plans:
  - [006-ci-release-automation-with-changesets.md](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/plans/006-ci-release-automation-with-changesets.md)
- PRs:
  - [PR #12](https://github.com/timshadel/openclaw-1p-sdk-resolver/pull/12)
- Commits:
  - `6ad13d0`
- Docs:
  - [package.json](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/package.json)
  - [ci.yml](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/.github/workflows/ci.yml)
