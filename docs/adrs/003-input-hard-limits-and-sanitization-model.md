# Input Hard Limits and Sanitization Model

- `id`: `003-input-hard-limits-and-sanitization-model`
- `status`: `accepted`
- `date`: `2026-02-28`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["contributors"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

The resolver consumes untrusted stdin and IDs from external callers.
Without strict bounds and sanitization, the process is vulnerable to abuse and undefined behavior.

## Decision

Enforce defensive input processing:

1. Hard limits for stdin size, id count, timeouts, and concurrency.
2. Sanitization and rejection rules for IDs/references.
3. Fail-closed behavior for invalid inputs.

## Consequences

- Positive:
  - Reduced resource exhaustion risk.
  - Clear safety envelope for untrusted inputs.
- Tradeoffs:
  - Some valid edge inputs may be rejected by strict rules.

## Alternatives considered

1. Soft/uncapped processing.
   - Rejected: too risky for CLI-provider execution.
2. Minimal validation with downstream-only errors.
   - Rejected: weaker trust boundary.

## References

- Plans:
  - `docs/plans/001-formal-plan-records-and-plan-phase-requirement.md`
- PRs:
  - N/A
- Commits:
  - `625c8ee`
  - `0b37dff`
  - `175f857`
- Docs:
  - `AGENTS.md`
