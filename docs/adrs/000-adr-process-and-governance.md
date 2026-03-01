# ADR Process and Governance

- `id`: `000-adr-process-and-governance`
- `status`: `accepted`
- `date`: `2026-02-28`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["contributors", "agents"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

The repository already uses formal pre-implementation plans in `docs/plans/` and a plan-first policy in `AGENTS.md`.
We also need a durable mechanism to document architectural decisions and rationale over time so that future maintainers can understand why key seams, policies, and thresholds exist.

## Decision

Adopt ADRs under `docs/adrs/` as the canonical architecture-decision record system with:

1. Numbered files using `NNN-<kebab-slug>.md`.
2. Required metadata fields and required sections defined in `docs/adrs/README.md`.
3. Lifecycle statuses: `proposed | accepted | rejected | superseded | deprecated`.
4. Append-only history model: ADR files are never deleted.

ADRs remain separate from formal plans:

- Plans define execution details before implementation.
- ADRs define long-lived architecture decisions and rationale.

## Consequences

- Positive:
  - Improves long-term maintainability and onboarding.
  - Reduces re-litigation of resolved architecture choices.
  - Creates an auditable trail for major technical decisions.
- Tradeoffs:
  - Adds process overhead for architecture-affecting changes.
  - Requires discipline to keep statuses and supersession links current.

## Alternatives considered

1. Keep decisions only in PR descriptions.
   - Rejected: difficult to discover over time and inconsistent structure.
2. Put architecture decisions in `docs/plans/` only.
   - Rejected: plans are execution-focused and can become stale after implementation.
3. Use code comments as decision records.
   - Rejected: distributed context is hard to navigate and easy to drift.

## References

- Plans:
  - `docs/plans/001-formal-plan-records-and-plan-phase-requirement.md`
- PRs:
  - N/A
- Commits:
  - N/A
- Docs:
  - `AGENTS.md`
  - `docs/adrs/README.md`
