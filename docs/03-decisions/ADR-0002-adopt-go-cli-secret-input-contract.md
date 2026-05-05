---
created: 2026-05-03
status: accepted
---

# ADR-0002: Adopt Go CLI Secret Input Contract

## Context

The Go trial implementation is a local CLI and OpenClaw exec secrets provider. It must authenticate to the official 1Password Go SDK with a service account token while avoiding raw secrets in argv, repository files, logs, or test fixtures.

Toolsmith guidance favors stable logical secret inputs, `ENV` and `*_FILE` delivery, fail-fast behavior when both forms are set, and provider-specific resolution at the edge. This repository tightens that model further: env/file token values are write-only import inputs, while runtime resolution and diagnostics must use the system keyring through `github.com/99designs/keyring`.

## Decision

- Implement the resolver as a Go CLI.
- Use the official 1Password Go SDK for secret resolution.
- Treat the token name as the logical input named `OCOP_SERVICE_ACCOUNT_TOKEN_NAME`.
- Treat the service account token value env vars `OCOP_SERVICE_ACCOUNT_TOKEN` and `OCOP_SERVICE_ACCOUNT_TOKEN_FILE` as write-only import inputs for the `token` command.
- Make `token` dry run by default and require `--write` for keyring mutation.
- Fail `token --write` when the keyring item already exists unless `--force` is provided.
- Fail closed in OpenClaw resolver mode when token loading fails or write-only token env vars are present.
- Support the system keyring as the only runtime service-account token source.
- Use fixed keyring service `openclaw-1p-sdk-resolver`.
- Use keyring account `tokens/<OCOP_SERVICE_ACCOUNT_TOKEN_NAME>`.
- Use `github.com/99designs/keyring` instead of custom credential-store code.
- Do not accept raw service account tokens on argv.
- Do not accept raw token names on argv.
- Do not print the full service account token or raw token name.
- Permit only token SHA256, token last 3 chars, and keyring account fingerprint in command output.
- Put keyring and SDK readiness checks under `doctor`.
- Use `doctor --sdk` for a coarse 1Password SDK auth check via vault listing without printing vault metadata.
- Keep real Keyring and real 1Password access out of tests by using injected fakes.

## Consequences

- Operators can import a token into the system keyring and avoid exporting it into runtime environments.
- OpenClaw still receives resolved secrets through the exec-provider protocol, so stdout remains sensitive during successful resolution.
- Runtime resolution depends on a supported `github.com/99designs/keyring` backend on the host.
- The system keyring is the runtime boundary and not a substitute for 1Password vault scoping, service-account rotation, or audit review.
