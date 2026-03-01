# Config Source Precedence and Policy Enforcement

- `id`: `002-config-source-precedence-and-policy-enforcement`
- `status`: `accepted`
- `date`: `2026-02-28`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["contributors", "operators"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

Resolver behavior depends on configuration and environment.
Inconsistent config resolution or weak vault policy controls create security and operability risks.

## Decision

Define deterministic config and policy behavior:

1. Fixed config source precedence.
2. Vault policy enforcement via `vaultPolicy` and `vaultWhitelist`.
3. Require explicit/default vault behavior that stays fail-closed.

## Consequences

- Positive:
  - Predictable runtime behavior.
  - Stronger vault access controls.
- Tradeoffs:
  - Additional configuration complexity for operators.

## Alternatives considered

1. Implicit and permissive vault access.
   - Rejected: too much accidental scope.
2. Ambiguous config source ordering.
   - Rejected: difficult debugging and drift risk.

## References

- Plans:
  - `docs/plans/002-openclaw-snippet-ux-and-path-guidance.md`
- PRs:
  - N/A
- Commits:
  - `c5d2627`
  - `ad3c15f`
  - `60ee72e`
- Docs:
  - `README.md`
