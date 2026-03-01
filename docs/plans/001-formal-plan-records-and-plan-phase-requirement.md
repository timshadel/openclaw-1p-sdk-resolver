# Formal Plan Records and Plan-Phase Requirement

- `id`: `001-formal-plan-records-and-plan-phase-requirement`
- `status`: `completed`
- `owners`: `openclaw-1p-sdk-resolver maintainers`
- `created`: `2026-02-28`
- `updated`: `2026-02-28`
- `related-issues`: `[]`
- `related-prs`: `[]`

## Summary

Adopt a formal plan-record workflow for substantial repository changes and require plan alignment before implementation for major and public-facing changes.

## Scope

### In scope

- Add `docs/plans/` convention documentation.
- Add a reusable plan template.
- Update contributor/agent policy to require plan-first workflow for major/public changes.
- Link plan records from the main README.

### Out of scope

- Changes to resolver runtime behavior.
- Changes to CLI output or protocol contracts.

## Public Interface Impact

None. This is a process/documentation change only.

## Implementation Steps

1. Create `docs/plans/README.md` with naming, status, and required-section rules.
2. Create `docs/plans/TEMPLATE.md` for consistent authoring.
3. Add this record as the first numbered plan (`001`).
4. Update `AGENTS.md` with an explicit plan-first requirement and exceptions.
5. Add README pointer to formal plan records.

## Tests and Acceptance Criteria

### Tests

- Run `pnpm test` to verify no behavior regressions.

### Acceptance Criteria

- `docs/plans/` exists with convention docs and template.
- `001` plan record is present and complete.
- `AGENTS.md` requires plan-first workflow for major/public changes.
- README links to formal plan records.
- Existing tests pass unchanged.

## Assumptions and Defaults

- Plan IDs are repository-global and strictly three-digit zero-padded.
- Trivial typo-only docs fixes and behavior-neutral test changes do not require a new plan.

## Rollout and Compatibility Notes

- Effective immediately for contributors and agents.
- Existing plan-less historical commits are not retroactively rewritten.
