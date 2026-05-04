---
created: 2026-05-03
status: accepted
---

# ADR-0002: Adopt Go CLI Secret Input Contract

## Context

The Go trial implementation is a local CLI and OpenClaw exec secrets provider. It must authenticate to the official 1Password Go SDK with a service account token while avoiding raw secrets in argv, repository files, logs, or test fixtures.

Toolsmith guidance favors stable logical secret inputs, `ENV` and `*_FILE` delivery, fail-fast behavior when both forms are set, and provider-specific resolution at the edge. The user also explicitly wants the service account token pulled from macOS Keychain for local execution.

## Decision

- Implement the resolver as a Go CLI.
- Use the official 1Password Go SDK for secret resolution.
- Treat the service account token as the logical input named `OP_SERVICE_ACCOUNT_TOKEN`.
- Support `OP_SERVICE_ACCOUNT_TOKEN` and `OP_SERVICE_ACCOUNT_TOKEN_FILE`.
- Fail fast for human CLI commands when both `OP_SERVICE_ACCOUNT_TOKEN` and `OP_SERVICE_ACCOUNT_TOKEN_FILE` are set.
- Fail closed in OpenClaw resolver mode when token loading fails.
- Support macOS Keychain as a local fallback token source when neither env nor file token input is present.
- Use `OP_SERVICE_ACCOUNT_TOKEN_KEYCHAIN_SERVICE` and `OP_SERVICE_ACCOUNT_TOKEN_KEYCHAIN_ACCOUNT` to select the Keychain item.
- Default the Keychain service to `openclaw-1p-sdk-resolver` and the account to `OP_SERVICE_ACCOUNT_TOKEN`.
- Implement Keychain lookup by invoking `/usr/bin/security find-generic-password -s <service> -a <account> -w` on darwin.
- Do not accept raw service account tokens on argv.
- Do not print the service account token.
- Keep real Keychain and real 1Password access out of tests by using injected fakes.

## Consequences

- Local macOS operators can avoid exporting the token into a long-lived shell environment.
- OpenClaw still receives resolved secrets through the exec-provider protocol, so stdout remains sensitive during successful resolution.
- Non-macOS execution must use `OP_SERVICE_ACCOUNT_TOKEN` or `OP_SERVICE_ACCOUNT_TOKEN_FILE` unless another token source is added by a future ADR.
- Keychain lookup is a local convenience and not a substitute for 1Password vault scoping, service-account rotation, or audit review.
