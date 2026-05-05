---
created: 2026-05-05
---

# Add Homebrew Quarantine Hook

## Summary

Add a Homebrew cask post-install hook through GoReleaser so installed cask binaries have `com.apple.quarantine` removed after install. This keeps the current unsigned, non-notarized release path usable while preserving the longer-term option to adopt Apple signing and notarization.

## Scope

- Add a GoReleaser `homebrew_casks` post-install hook that runs `/usr/bin/xattr -dr com.apple.quarantine` on the staged `openclaw-1p-sdk-resolver` binary on macOS.
- Validate the generated cask syntax and snapshot release output.
- Commit the change on local `main`.
- Publish local `main` with same-name push only after verifying local branch identity.
- Tag and release `v0.3.1`.

## Validation

- `goreleaser check`
- `goreleaser release --snapshot --clean`
- Inspect generated cask output for the post-install hook.

## Git Workflow

Use the `git-workflow` skill as often as prudent. Finish with cohesive commits, a clean working directory, a same-name push from local `main`, and the `v0.3.1` release tag only after local state is verified.
