---
created: 2026-05-05
status: accepted
---

# Add GoReleaser Release Automation

## Summary

Add a minimal GoReleaser release path for the Go CLI. The first pass should publish tagged GitHub releases from GitHub Actions, inject version metadata at build time, and keep release packaging boring and auditable.

## Scope

- Add `.goreleaser.yaml` for the `openclaw-1p-sdk-resolver` binary.
- Add `.github/workflows/release.yml` for tag-triggered releases.
- Wire CLI version output for GoReleaser `ldflags`.
- Document local snapshot checks and tag-based release behavior in the README.
- Publish a Homebrew cask to the `timshadel/tools` tap, backed by `timshadel/homebrew-tools`.

## Constraints

- The 1Password Go SDK currently blocks ordinary CGO-disabled cross-compilation, so release builds must use CGO.
- This pass should not promise Linux artifacts from a single hosted release runner.
- Use a macOS release runner for the initial artifact set.
- Do not add signing or attestations without a separate decision.
- Cross-repository tap publishing requires a repository secret named `TAP_GITHUB_TOKEN` with write access to `timshadel/homebrew-tools`.

## Acceptance Criteria

- `goreleaser check` passes.
- `goreleaser release --snapshot --clean` passes locally.
- `go test ./...`, `go test -race ./...`, `go vet ./...`, and `golangci-lint` pass.
- Version output can be set through GoReleaser `ldflags`.
- Releases publish a Homebrew cask to `timshadel/homebrew-tools`.
