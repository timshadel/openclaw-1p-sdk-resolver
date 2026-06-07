---
created: 2026-06-07
---

# Interactive Token Import

## Intent

Change token import so raw service-account tokens are accepted only through an interactive hidden prompt. Remove env/file token values as import sources, replace `token --write` with `token --prompt-and-save`, and keep no-arg `token` as a prompt-based dry run.

## Scope

- Add prompt-only token import and proof generation.
- Keep `OCOP_SERVICE_ACCOUNT_TOKEN_NAME` as the nonsecret Keychain item selector.
- Keep fail-fast rejection of `OCOP_SERVICE_ACCOUNT_TOKEN` and `OCOP_SERVICE_ACCOUNT_TOKEN_FILE` on `token`, `doctor`, and resolver mode.
- Make `--write` return a targeted migration error instead of acting as an alias.
- Update README and ADR-0002 for the new interactive-only import contract.

## Implementation

1. Refactor auth token import types from env/file sources to prompt source.
2. Add an injectable prompt reader and a production `/dev/tty` hidden prompt implementation.
3. Update the Cobra `token` command to support `--prompt-and-save`, preserve `--force` and `--json`, and reject `--write` with migration guidance.
4. Update token command tests, auth tests, README, and ADR-0002.
5. Use the `git-workflow` skill as often as prudent to create a semantically cohesive commit during implementation.

## Validation

- Run `mise exec -- go test ./...`.
- Run `mise exec -- go test -race ./...`.
- Run `mise exec -- go vet ./...`.
- Run `mise exec -- golangci-lint run`.

## Completion

Use the `git-workflow` skill to finish committing the work completed for this plan and leave the working directory clean.
