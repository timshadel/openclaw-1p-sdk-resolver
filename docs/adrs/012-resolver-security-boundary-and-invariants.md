# Resolver Security Boundary and Invariants

- `id`: `012-resolver-security-boundary-and-invariants`
- `status`: `accepted`
- `date`: `2026-03-01`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["operators", "contributors"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

An external security analysis provides broader recommendations spanning both resolver and OpenClaw deployment posture.
This repository only controls the resolver binary and its documented behavior.
Without a boundary decision, docs and implementation can drift into untestable promises about external systems.

Source report: [Resolver Security Alignment - 1Password Ideal vs OpenClaw Reality](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/reports/resolver-security-alignment-1password-ideal-vs-openclaw-reality.md)

## Decision

1. This project enforces resolver-controlled guarantees only.
2. Core invariants are:
   - fail-closed behavior,
   - no secret leakage in non-reveal outputs,
   - deterministic policy enforcement.
3. External platform hardening recommendations are documented as informational context only, not mandatory policy in this repository.

## Consequences

- Positive:
  - Security claims remain testable and enforceable.
  - Scope stays aligned with actual repository control.
  - Reduced policy overreach into external operator environments.
- Tradeoff:
  - Some report recommendations remain advisory because enforcement belongs outside this codebase.

## Alternatives considered

1. Treat external OpenClaw hardening guidance as mandatory project policy.
   - Rejected: outside repository control and not fully testable here.
2. Rely on implicit boundaries without a formal ADR.
   - Rejected: invites drift and inconsistent documentation claims.

## References

- Plans:
  - [005-resolver-security-alignment-program.md](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/plans/005-resolver-security-alignment-program.md)
- PRs:
  - N/A
- Commits:
  - pending implementation commit
- Docs:
  - [Resolver Security Alignment - 1Password Ideal vs OpenClaw Reality](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/reports/resolver-security-alignment-1password-ideal-vs-openclaw-reality.md)
  - [001-exec-provider-fail-closed-contract.md](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/adrs/001-exec-provider-fail-closed-contract.md)
  - [006-safe-diagnostics-and-reveal-gating.md](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/adrs/006-safe-diagnostics-and-reveal-gating.md)
  - [008-cli-surface-and-output-contracts.md](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/adrs/008-cli-surface-and-output-contracts.md)
  - [011-diagnostics-command-cohesion-and-flag-model.md](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/adrs/011-diagnostics-command-cohesion-and-flag-model.md)
