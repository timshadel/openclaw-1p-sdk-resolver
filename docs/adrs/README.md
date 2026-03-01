# Architecture Decision Records (ADRs)

This directory stores durable architecture decisions and their rationale.

## Purpose

Use ADRs to capture long-lived, high-impact technical decisions that shape how this repository is designed and maintained.

## ADRs vs Formal Plans

- `docs/plans/`:
  - pre-implementation execution specs for upcoming work.
- `docs/adrs/`:
  - durable architectural decisions (what we decided and why).

Both are required when applicable:

- Major/public change: formal plan first.
- Architecture-impacting decision: ADR.

## Location

- ADR files live in `docs/adrs/`.

## Naming

- `NNN-<kebab-slug>.md`
- `NNN` is zero-padded three-digit sequence.
- `000` is reserved for ADR process/governance.

## Required Metadata

Each ADR must include:

- `id`
- `status` (`proposed | accepted | rejected | superseded | deprecated`)
- `date`
- `deciders`
- `consulted`
- `informed`
- `supersedes` (optional)
- `superseded-by` (optional)

## Required Sections

1. Context
2. Decision
3. Consequences
4. Alternatives considered
5. References (plans/PRs/commits/docs)

Use [`TEMPLATE.md`](./TEMPLATE.md) for new ADRs.

## Status and Lifecycle Rules

- New ADRs should start as `proposed` or `accepted`.
- If a decision changes, create a new ADR and mark the old one `superseded`.
- Never delete ADR files; preserve history.

## Index

- [`000-adr-process-and-governance.md`](./000-adr-process-and-governance.md)
- [`001-exec-provider-fail-closed-contract.md`](./001-exec-provider-fail-closed-contract.md)
- [`002-config-source-precedence-and-policy-enforcement.md`](./002-config-source-precedence-and-policy-enforcement.md)
- [`003-input-hard-limits-and-sanitization-model.md`](./003-input-hard-limits-and-sanitization-model.md)
- [`004-onepassword-adapter-fallback-strategy.md`](./004-onepassword-adapter-fallback-strategy.md)
- [`005-process-boundary-seam-and-injected-runtime-context.md`](./005-process-boundary-seam-and-injected-runtime-context.md)
- [`006-safe-diagnostics-and-reveal-gating.md`](./006-safe-diagnostics-and-reveal-gating.md)
- [`007-openclaw-integration-read-only-policy.md`](./007-openclaw-integration-read-only-policy.md)
- [`008-cli-surface-and-output-contracts.md`](./008-cli-surface-and-output-contracts.md)
- [`009-provider-identity-and-command-family-naming.md`](./009-provider-identity-and-command-family-naming.md)
- [`010-quality-gates-and-coverage-policy.md`](./010-quality-gates-and-coverage-policy.md)
- [`011-diagnostics-command-cohesion-and-flag-model.md`](./011-diagnostics-command-cohesion-and-flag-model.md)
