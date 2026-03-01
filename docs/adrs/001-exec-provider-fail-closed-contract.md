# Exec Provider Fail-Closed Contract

- `id`: `001-exec-provider-fail-closed-contract`
- `status`: `accepted`
- `date`: `2026-02-28`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["contributors", "integrators"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

The resolver runs as an OpenClaw exec provider and is part of a secrets resolution path.
Malformed input, missing auth, or SDK failures must not crash protocol interactions or leak sensitive diagnostics.

## Decision

Adopt a fail-closed runtime contract:

1. Always return valid protocol JSON.
2. On failure, return empty `values`.
3. Avoid secret-bearing error output in normal operation.

## Consequences

- Positive:
  - Stable integration behavior under failure.
  - Lower risk of accidental secret leakage.
- Tradeoffs:
  - Less granular error detail in protocol mode.

## Alternatives considered

1. Fail open (return partial/unsafe data on errors).
   - Rejected: too risky for secrets workflows.
2. Throw process-level errors on malformed inputs.
   - Rejected: breaks exec-provider resilience expectations.

## References

- Plans:
  - `docs/plans/001-formal-plan-records-and-plan-phase-requirement.md`
- PRs:
  - N/A
- Commits:
  - `b0831d1`
  - `625c8ee`
  - `d4c01b6`
- Docs:
  - `README.md`
  - `AGENTS.md`
