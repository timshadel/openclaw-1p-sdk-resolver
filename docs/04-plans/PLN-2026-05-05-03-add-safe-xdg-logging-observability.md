---
created: 2026-05-05
---

# Add Safe XDG Logging Observability

## Intent

Add file-backed observability for resolver, token, and doctor execution without writing diagnostics to resolver stdout or exposing service account tokens and resolved secret values. Logs should explain which nonsecret steps the CLI is taking, what it is trying to resolve, and where failures occur.

## Scope

- Load optional XDG config from `openclaw-1p-sdk-resolver/config.json`.
- Default log output to an XDG state location when the config does not override paths.
- Use structured Go logging through the standard library.
- Keep normal operational logging and error logging separate unless explicitly configured to the same path.
- Log secret references and requested IDs only as nonsecret fingerprints plus safe counts/statuses.
- Document config and log locations in `README.md`.
- Use the `git-workflow` skill as often as prudent to create cohesive commits during implementation and finish with committed work and a clean working directory.

## Validation

- Run `go test ./...`.
- Run `go test -race ./...`.
- Run `go vet ./...`.
- Run `golangci-lint run` if available.
- Run a local resolver command and verify stdout remains protocol JSON while log files are written.
