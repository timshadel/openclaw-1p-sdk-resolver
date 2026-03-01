# Process Boundary Seam and Injected Runtime Context

- `id`: `005-process-boundary-seam-and-injected-runtime-context`
- `status`: `accepted`
- `date`: `2026-02-28`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["contributors"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

Direct process access (`process.env`, stdio, argv) deep inside business logic made testing harder and increased coupling.

## Decision

Enforce an architecture seam:

1. Keep process-bound concerns at CLI/runtime edges.
2. Inject runtime context into core logic.
3. Prefer pure helpers for resolve and config flows.

## Consequences

- Positive:
  - Stronger testability and deterministic tests.
  - Cleaner separation of concerns.
- Tradeoffs:
  - Additional plumbing types/functions.

## Alternatives considered

1. Continue direct process access in deep code paths.
   - Rejected: weak seams and brittle tests.
2. Full dependency-injection framework.
   - Rejected: unnecessary overhead for project scale.

## References

- Plans:
  - `docs/plans/001-formal-plan-records-and-plan-phase-requirement.md`
- PRs:
  - N/A
- Commits:
  - `4299161`
  - `569e5f1`
- Docs:
  - `README.md`
