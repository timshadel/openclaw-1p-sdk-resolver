---
created: 2026-05-05
---

# Use 1Password ResolveAll

## Intent

Use the 1Password Go SDK batch secret resolution API so each resolver request resolves all requested references with one SDK call while preserving partial-success behavior and safe logging.

## Scope

- Replace per-reference `Secrets().Resolve` calls with one `Secrets().ResolveAll` call.
- Preserve the existing `SecretResolver` interface and resolver protocol output.
- Omit failed individual refs while returning successful refs.
- Keep logs free of raw refs and secret values.
- Add focused fake-backed tests for all-success, partial-success, top-level error, and malformed individual responses.
- Use the `git-workflow` skill as often as prudent to create cohesive commits during implementation and finish with committed work and a clean working directory.

## Validation

- Run `go test ./...`.
- Run `go test -race ./...`.
- Run `go vet ./...`.
- Run `golangci-lint run ./...`.
- Run `goreleaser check`.
- Run `goreleaser release --snapshot --clean`.
- Run GoReleaser arm64 binary integration with `OCOP_*` env vars and report only value keys and lengths.
