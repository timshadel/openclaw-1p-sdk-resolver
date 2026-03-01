---
"openclaw-1p-sdk-resolver": minor
---

Aggregate release for all unreleased changes since `v0.1.0`.

Highlights:

- Improved OpenClaw snippet guidance and canonical provider-output formatting.
- Added CI quality gates for tests, coverage thresholds, docs consistency, governance checks, and security checks.
- Upgraded key tooling and dependencies, including `@1password/sdk` to `0.4.0`, TypeScript, Node typings, and CI actions.
- Updated runtime policy to require modern Node (`>=22.12.0`) and aligned CI/test matrix accordingly.
- Added and then refined Changesets-based publishing and release workflow controls, including intentional manual release dispatch.
- Strengthened architecture/governance documentation with plans and ADR updates to reflect these decisions.

Notes:

- This release intentionally drops Node 20 support.
- Exit-code typing/compatibility handling was updated to keep behavior stable while satisfying stricter Node typings.
