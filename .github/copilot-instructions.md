# Repository Copilot Review Focus

When reviewing pull requests in this repository, prioritize these invariants:

1. Fail-closed behavior must be preserved for malformed input, auth failures, and SDK/runtime failures.
2. No secret values may appear in default logs/output paths.
3. Deterministic policy enforcement is required for ID sanitization and vault policy checks.
4. New behavior changes must include tests and should not regress coverage policy.
5. README command/docs updates must stay consistent with actual CLI behavior.
6. Architecture-sensitive changes should include plan/ADR updates under `docs/plans/` and `docs/adrs/`.

Copilot review is advisory; required merge approvals must come from humans.
