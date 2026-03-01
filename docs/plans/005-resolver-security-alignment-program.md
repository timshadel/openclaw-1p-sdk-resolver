# Resolver Security Alignment Program

- `id`: `005-resolver-security-alignment-program`
- `status`: `completed`
- `owners`: `openclaw-1p-sdk-resolver maintainers`
- `created`: `2026-03-01`
- `updated`: `2026-03-01`
- `related-issues`: `[]`
- `related-prs`: `[]`

## Summary

Define the program-level security alignment scope based on the external analysis report, strictly bounded to guarantees this repository can implement and test.

Source report: [Resolver Security Alignment - 1Password Ideal vs OpenClaw Reality](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/reports/resolver-security-alignment-1password-ideal-vs-openclaw-reality.md)

## Scope

### In scope

- Establish and document the repository control boundary.
- Implement resolver-controlled security invariants hardening.
- Define and capture acceptance evidence for invariants.

### Out of scope

- Upstream OpenClaw code changes.
- Prescriptive policy mandates for user OpenClaw deployments.

## Public Interface Impact

No protocol schema changes. Security invariants are enforced against existing contracts.

## Implementation Steps

1. Record the program scope and report linkage in this plan.
2. Accept ADR `012` to lock the security boundary and invariants.
3. Verify fail-closed semantics in resolver and protocol paths.
4. Verify no-secret diagnostics across all non-reveal CLI outputs.
5. Add and maintain canary leak-prevention tests for non-reveal outputs.
6. Validate with test + coverage evidence.

## Tests and Acceptance Criteria

### Tests

- `pnpm test`
- `pnpm test --coverage`

### Acceptance Criteria

- ADR `012` is accepted and linked.
- Secret canary values do not appear in non-reveal outputs.
- Fail-closed behavior remains deterministic and test-backed.
- No-arg resolver protocol contract remains unchanged.
- Docs remain limited to repository-controlled guarantees.
- Test and coverage evidence is captured.

## Assumptions and Defaults

- The report is design input, not normative policy.
- Pre-release state allows hardening without migration complexity.
- `resolve --reveal` remains the only explicit secret-output path.
- Existing `check --strict --details` behavior remains in place.

## Rollout and Compatibility Notes

Pre-release hardening; no compatibility alias requirements.

## Evidence

- ADR: [012-resolver-security-boundary-and-invariants.md](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/docs/adrs/012-resolver-security-boundary-and-invariants.md)
- Tests include non-reveal canary protections in [cli.commands.test.ts](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/test/cli.commands.test.ts).
- Resolver fail-closed behavior is covered in [resolver.test.ts](/Users/timshadel/projects/timshadel/openclaw-1p-sdk-resolver/test/resolver.test.ts).
