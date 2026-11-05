---
created: 2026-11-05
---

# Keep Generated Homebrew Casks Compatible

Pin local and release-workflow GoReleaser to 2.20.0 so generated casks declare
their macOS platform and use the supported zap stanza. Migrate the install hook
to declarative steps without changing its operation.

GoReleaser 2.20.0 omits the empty line before its generated macOS dependency.
Keep GoReleaser as the generator, disable its direct cask upload, and make the
release workflow format and validate that generated artifact before committing
it to a clean checkout of the tap's main branch. Use a normal same-name push;
never force a concurrent tap update. Keep the released application archives and
version unchanged for the current tap repair.

Validate the configuration, build both macOS snapshot archives without
publishing, and check generated and repaired casks with Homebrew style and
cross-platform loading/audits. Check the release workflow's shell syntax and
exercise its formatting/commit step against a disposable local tap remote.
Rerun the tap's GitHub checks and keep both repository PRs in draft.

Use the git-workflow skill as often as prudent for cohesive commits. The final
implementation step is to use that skill to finish committing this plan's work
and leave the working directory clean.
