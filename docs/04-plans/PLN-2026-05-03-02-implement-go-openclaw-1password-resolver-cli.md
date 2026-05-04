---
created: 2026-05-03
---

# PLN-2026-05-03-02: Implement Go OpenClaw 1Password Resolver CLI

## Summary

Implement a Go CLI that fulfills the OpenClaw exec secrets-provider protocol by resolving requested IDs through the official 1Password Go SDK. The CLI must be safe by default, support logical service-token input sources, and read the 1Password service account token from macOS Keychain when env/file inputs are not present.

## Scope

- Add a Go module and CLI entrypoint.
- Implement OpenClaw no-argument resolver mode:
  - read JSON request from stdin,
  - map IDs to 1Password secret references,
  - resolve secrets through the official 1Password Go SDK,
  - emit protocol JSON on stdout,
  - fail closed with an empty `values` map on malformed input, missing auth, or SDK errors.
- Implement token loading from:
  - `OP_SERVICE_ACCOUNT_TOKEN`,
  - `OP_SERVICE_ACCOUNT_TOKEN_FILE`,
  - macOS Keychain via configurable service/account lookup.
- Add a minimal `resolve` command for human diagnostics that redacts values unless `--reveal --yes` is supplied.
- Add `version` and `help` command behavior through the Go CLI stack.
- Add tests for protocol behavior, ID mapping, token-source precedence, Keychain command integration boundaries, and redaction.
- Add durable ADR documentation for the auth/token-source contract.

## Out Of Scope

- Editing OpenClaw config files.
- Adding 1Password CLI wrappers or storing provider references in tracked config.
- Implementing a session helper, sign-in/sign-out flow, or brokered agent runtime.
- Resolving real 1Password secrets in tests.

## Implementation Steps

1. Add `docs/03-decisions/ADR-0002-adopt-go-cli-secret-input-contract.md`.
2. Initialize the Go module.
3. Add internal packages for protocol parsing/formatting, sanitization/reference mapping, token loading, Keychain lookup, 1Password resolving, and CLI orchestration.
4. Wire the CLI entrypoint under `cmd/openclaw-1p-sdk-resolver`.
5. Add table-driven unit tests with fakes for SDK and Keychain behavior.
6. Update `README.md` with build, usage, OpenClaw protocol, and Keychain setup guidance.
7. Run `gofmt`, `go test ./...`, `go test -race ./...`, and `go vet ./...`.
8. Use the `git-workflow` skill as often as prudent to create semantically cohesive commits during implementation.
9. Use the `git-workflow` skill to finish committing this plan's work and leave the working directory clean.

## Acceptance Criteria

- `go test ./...`, `go test -race ./...`, and `go vet ./...` pass.
- No tests call real 1Password or real Keychain.
- Missing token and SDK failures return valid protocol JSON with empty `values`.
- Token input fails fast when both `OP_SERVICE_ACCOUNT_TOKEN` and `OP_SERVICE_ACCOUNT_TOKEN_FILE` are set.
- Keychain fallback can read from a configurable service/account and does not print the token.
- `resolve` redacts secret values by default and requires `--reveal --yes` to print values.
- README documents the logical token contract and Keychain setup command.

## Validation

- `gofmt` on Go files.
- `go test ./...`
- `go test -race ./...`
- `go vet ./...`
