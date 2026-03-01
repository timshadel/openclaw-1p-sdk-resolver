# Architecture Decision Records (ADR) Framework

- `id`: `003-architecture-decision-records-framework`
- `status`: `completed`
- `owners`: `openclaw-1p-sdk-resolver maintainers`
- `created`: `2026-02-28`
- `updated`: `2026-02-28`
- `related-issues`: `[]`
- `related-prs`: `[]`

## Summary

Introduce a formal ADR system in this repository to capture durable architecture decisions and rationale, separate from pre-implementation formal plans.

## Scope

### In scope

- Add ADR directory conventions and lifecycle guidance.
- Add ADR template with required metadata and sections.
- Add bootstrap ADR documenting ADR process/governance.
- Update contributor/agent policy to require ADRs for architecture-impacting decisions.
- Add README pointer clarifying plans vs ADRs.

### Out of scope

- Historical ADR backfill from commit history.
- Runtime behavior changes.
- CLI/protocol/config schema changes.

## Public Interface Impact

None. This is a documentation and governance change only.

## Implementation Steps

1. Create `docs/adrs/README.md` with naming, status lifecycle, and required structure.
2. Create `docs/adrs/TEMPLATE.md` for consistent ADR authoring.
3. Create `docs/adrs/000-adr-process-and-governance.md` as the bootstrap ADR.
4. Update `AGENTS.md` to require ADRs for architecture-impacting decisions and define exceptions.
5. Update `README.md` to add an ADR section and clarify ADR vs plan purpose.

## Tests and Acceptance Criteria

### Tests

- Run `pnpm test`.
- Run docs consistency scan across `README.md`, `AGENTS.md`, `docs/plans/`, and `docs/adrs/`.

### Acceptance Criteria

- `docs/adrs/` exists with `README`, `TEMPLATE`, and `000` bootstrap ADR.
- `AGENTS.md` includes an enforceable ADR requirement section.
- `README.md` links to ADR docs and distinguishes plans from ADRs.
- Existing tests pass unchanged.

## Assumptions and Defaults

- ADR numbering is repository-global and zero-padded three digits.
- ADR files are append-only and never deleted.
- Plans and ADRs are complementary and both required when applicable.

## Rollout and Compatibility Notes

- Effective immediately for contributors and agents.
- Follow-up work will separately scan commit history and propose candidate ADRs (`001+`) for accepted past decisions.
