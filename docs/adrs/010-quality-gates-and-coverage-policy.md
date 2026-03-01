# Quality Gates and Coverage Policy

- `id`: `010-quality-gates-and-coverage-policy`
- `status`: `accepted`
- `date`: `2026-02-28`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["contributors"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

Security-sensitive resolver behavior requires robust regression detection.
Coverage and tests became part of architecture-level quality governance, not only implementation detail.

## Decision

Maintain explicit quality gates:

1. Expand coverage across protocol, sanitize, adapter, CLI, and resolver paths.
2. Treat branch coverage and line coverage targets as enforced quality policy.
3. Keep test and coverage tooling as stable project infrastructure.

## Consequences

- Positive:
  - Better confidence for safety-critical behavior and refactors.
  - Faster detection of contract regressions.
- Tradeoffs:
  - Additional maintenance overhead for tests.
  - Occasional complexity for hard-to-reach branches.

## Alternatives considered

1. Rely on minimal smoke tests.
   - Rejected: insufficient for policy-heavy CLI/resolver behavior.
2. Ignore branch coverage and focus only on line coverage.
   - Rejected: misses important decision-path behavior.

## References

- Plans:
  - `docs/plans/001-formal-plan-records-and-plan-phase-requirement.md`
- PRs:
  - N/A
- Commits:
  - `b9c8d92`
  - `95578d7`
  - `175f857`
- Docs:
  - `AGENTS.md`
