---
created: 2026-05-03
governance_audit: remediation-plan
---

# PLN-2026-05-03-01: Set Up Governance Docs

## Summary

Set up the initial governance baseline for the `trial/go-impl` branch after resetting it to the repository's first commit.

## Scope

- Create canonical governance lifecycle directories.
- Add repo-local policy in `README.md` and `AGENTS.md`.
- Add an accepted governance ADR.
- Preserve empty lifecycle and archive directories with `.gitkeep` placeholders.

## Out Of Scope

- Migrating historical TypeScript implementation governance from the archived branch.
- Adding repo-local governance helper scripts or templates.
- Defining Go implementation architecture.

## Implementation Steps

1. Save this plan under `docs/04-plans/` and mark it as the governance audit remediation baseline.
2. Add lifecycle and archive directory placeholders.
3. Add `README.md` governance policy.
4. Add `AGENTS.md` agent governance instructions.
5. Add an accepted governance ADR in `docs/03-decisions/`.
6. Use the `git-workflow` skill as often as prudent to create semantically cohesive commits during implementation.
7. Use the `git-workflow` skill to finish committing this plan's work and leave the working directory clean.

## Acceptance Criteria

- `README.md` documents the lifecycle, routing, naming, archive behavior, and planning etiquette.
- `AGENTS.md` documents the same agent-facing governance expectations.
- `docs/03-decisions/ADR-0001-adopt-repository-governance-lifecycle.md` records the durable governance decision.
- All canonical live and archive lifecycle folders are present in the repository.
- The working directory is clean after the work is committed.

## Validation

- Inspect generated Markdown for required frontmatter and canonical section content.
- Run `git status --short --branch` before final handoff.
