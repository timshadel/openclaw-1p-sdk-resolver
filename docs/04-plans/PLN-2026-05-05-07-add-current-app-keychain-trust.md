---
created: 2026-05-05
---

# Add Current App Keychain Trust

## Intent

Support the narrow macOS Keychain trust flow this resolver needs: trust the writing application for one selected service-account token item, and let operators verify that the current application can read that item without triggering a GUI trust prompt.

## Scope

- Remove explicit trusted application path support.
- Make normal token writes trust the writing application on macOS through `github.com/99designs/keyring`.
- Add commands to update and check current-application trust for the token selected by `OCOP_SERVICE_ACCOUNT_TOKEN_NAME`.
- Keep the raw token name out of argv and output.
- Add a Homebrew cask caveat warning that trust update is required after install or upgrade.

## Out Of Scope

- Mass-updating trust for multiple token names.
- Accepting arbitrary trusted application paths.
- Granting all applications access.

## Implementation

1. Add auth helpers for current-app trust update and noninteractive trust check.
2. Add a `trust` command with `update` and `check` subcommands.
3. Update README and Homebrew cask caveats.
4. Add focused unit tests with injected trust-capable keyring fakes.
5. Use the `git-workflow` skill as often as prudent to create semantically cohesive commits during implementation.

## Validation

- Run `go test ./...`.
- Run GoReleaser config validation if available locally.

## Completion

Use the `git-workflow` skill to finish committing the work completed for this plan and leave the working directory clean.
