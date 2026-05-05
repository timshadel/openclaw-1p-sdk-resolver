---
created: 2026-05-05
---

# Rename App Env Vars To OCOP

## Intent

Rename every environment variable owned by this resolver from `OP_*` to `OCOP_*` so resolver configuration and token import inputs are not confused with variables intended for the 1Password `op` CLI or SDK.

## Scope

- Rename service account token selection and import inputs to `OCOP_SERVICE_ACCOUNT_TOKEN_NAME`, `OCOP_SERVICE_ACCOUNT_TOKEN`, and `OCOP_SERVICE_ACCOUNT_TOKEN_FILE`.
- Rename resolver configuration inputs to `OCOP_RESOLVER_TIMEOUT_MS`, `OCOP_RESOLVER_CLIENT_NAME`, `OCOP_RESOLVER_CLIENT_VERSION`, and `OCOP_DEFAULT_VAULT`.
- Do not support fallback to the old app-owned `OP_*` names.
- Preserve keyring service and account storage format.
- Update README, ADR-0002, active code, tests, and relevant live plan docs.
- Use the `git-workflow` skill as often as prudent to create cohesive commits during implementation and finish with committed work and a clean working directory.

## Validation

- Run `go test ./...`.
- Run `go test -race ./...`.
- Run `go vet ./...`.
- Run `golangci-lint run ./...`.
- Run `goreleaser check`.
- Run `goreleaser release --snapshot --clean`.
- Run the GoReleaser arm64 binary integration check with `OCOP_*` env vars.
