---
created: 2026-05-04
---

# PLN-2026-05-04-01: Tighten Token Handling And Doctor Command Surface

## Summary

Refactor the Go CLI around resolver mode, `token`, and `doctor`. Resolver mode must use a system keyring token selected by `OP_SERVICE_ACCOUNT_TOKEN_NAME`. The `token` command imports the token from env/file into the system keyring and is dry run by default. The `doctor` command owns keyring and optional 1Password SDK readiness checks.

## Scope

- Remove human `resolve` and all reveal behavior.
- Add `token [--write] [--force] [--json]`.
- Add `doctor [--sdk] [--json]`.
- Make env/file token values write-only import inputs.
- Make resolver mode and `doctor` reject env/file token values.
- Update README and ADR-0002 to match the tightened token contract.

## Implementation Steps

1. Update ADR-0002 to supersede env/file runtime fallback behavior.
2. Refactor auth/token loading into import mode and keyring runtime mode.
3. Use `github.com/99designs/keyring` for credential-store access rather than custom platform code.
4. Replace CLI `resolve` with `token` and `doctor`.
5. Update resolver mode to use keyring-only runtime token loading.
6. Update README command and token-contract docs.
7. Add fake-only tests for token import, doctor, and resolver failure modes.
8. Run `gofmt`, `go test ./...`, `go test -race ./...`, `go vet ./...`, and `mise exec golangci-lint@2.11.4 -- golangci-lint run`.
9. Use the `git-workflow` skill to finish committing this plan's work and leave the working directory clean.

## Acceptance Criteria

- Token name is accepted only through `OP_SERVICE_ACCOUNT_TOKEN_NAME`.
- Keyring service is always `openclaw-1p-sdk-resolver`.
- Keyring account is always `tokens/<name>`.
- Full token and raw token name are never printed.
- Token output may include only token SHA256, token last 3 chars, and account fingerprint.
- Resolver mode fails closed if `OP_SERVICE_ACCOUNT_TOKEN` or `OP_SERVICE_ACCOUNT_TOKEN_FILE` is present.
- `doctor --sdk` reports only coarse SDK auth status and does not print vault metadata.
