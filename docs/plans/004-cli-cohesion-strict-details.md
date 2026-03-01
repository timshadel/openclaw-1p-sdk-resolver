# CLI Cohesion: `check + --strict + --details`

- `id`: `004-cli-cohesion-strict-details`
- `status`: `completed`
- `owners`: `openclaw-1p-sdk-resolver maintainers`
- `created`: `2026-03-01`
- `updated`: `2026-03-01`
- `related-issues`: `[]`
- `related-prs`: `[]`

## Summary

Unify diagnostics semantics across command families by keeping `check` as the diagnostics action, using `--strict` for findings exit behavior, and using `--details` for expanded diagnostic depth.
Remove legacy `diagnose` subcommands and `--check` flag.

## Scope

### In scope

- Replace strictness flag `--check` with `--strict`.
- Replace `diagnose` subcommands with `check --details`.
- Align usage/help/docs/tests accordingly.
- Keep no-arg resolver protocol behavior unchanged.

### Out of scope

- Protocol schema changes.
- Runtime resolver behavior changes unrelated to diagnostics UX.

## Public Interface Impact

- Removed:
  - `openclaw diagnose`
  - `1password diagnose`
  - `--check`
- Added/standardized:
  - `--strict`
  - `--details`

## Implementation Steps

1. Add this plan record.
2. Update CLI usage and routing.
3. Consolidate check/diagnose handlers into `check` with depth flag.
4. Update strictness logic to `--strict`.
5. Update README command examples and semantics text.
6. Add ADR documenting diagnostics cohesion model.
7. Update tests to new command/flag surface.

## Tests and Acceptance Criteria

### Tests

- `pnpm test`
- CLI command tests for `--strict` and `--details`.

### Acceptance Criteria

- No `diagnose` subcommands remain in routing/help/docs/tests.
- No `--check` strictness flag remains.
- `--strict` and `--details` work consistently across `openclaw check` and `1password check`.
- Resolver protocol contract remains unchanged.

## Assumptions and Defaults

- Project is pre-release, so hard removal of legacy names is acceptable.
- Two depth levels (default + `--details`) are sufficient.

## Rollout and Compatibility Notes

- No backward compatibility shims or aliases retained for removed names.
