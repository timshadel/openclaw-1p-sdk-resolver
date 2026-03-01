# 1Password Adapter Fallback Strategy

- `id`: `004-onepassword-adapter-fallback-strategy`
- `status`: `accepted`
- `date`: `2026-02-28`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["contributors"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

SDK behavior and available methods can vary by version and response shape.
A rigid single-path resolution model increases runtime fragility.

## Decision

Use layered resolver strategy:

1. Prefer bulk resolution (`resolveAll`) where available.
2. Fallback to per-reference resolution for compatibility.
3. Support partial success semantics while omitting unresolved values.

## Consequences

- Positive:
  - Better compatibility across SDK behavior variants.
  - Improved resilience under partial failures.
- Tradeoffs:
  - More adapter complexity and branching.

## Alternatives considered

1. Require only bulk resolve.
   - Rejected: brittle across SDK changes.
2. Require only per-ref resolve.
   - Rejected: misses bulk efficiency and capabilities.

## References

- Plans:
  - `docs/plans/001-formal-plan-records-and-plan-phase-requirement.md`
- PRs:
  - N/A
- Commits:
  - `3241a76`
  - `b0831d1`
- Docs:
  - `README.md`
