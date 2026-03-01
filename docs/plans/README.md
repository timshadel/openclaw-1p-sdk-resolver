# Formal Plan Records

This directory stores decision-complete implementation plans for substantial changes.

## Purpose

Formal plans are required before implementation for major changes and for changes that affect public APIs, CLI UX, or behavior contracts.

## Naming

- File names must use: `NNN-<kebab-slug>.md`
- `NNN` is a repository-global, zero-padded three-digit sequence (`001`, `002`, ...).

## Required Status

Each plan file must include a status field with one of:

- `proposed`
- `approved`
- `in-progress`
- `completed`
- `superseded`

## Required Sections

Each plan must include:

1. Title
2. Summary
3. Scope (in/out)
4. Public interface impact
5. Implementation steps
6. Tests and acceptance criteria
7. Assumptions/defaults
8. Rollout/compat notes

Use [`TEMPLATE.md`](./TEMPLATE.md) for new plans.

## Rule of Thumb

Create one plan file per substantial change. Small typo-only docs fixes and test-only changes that do not alter behavior contracts do not require a new formal plan.
