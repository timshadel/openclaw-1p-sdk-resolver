# OpenClaw Integration Read-Only Policy

- `id`: `007-openclaw-integration-read-only-policy`
- `status`: `accepted`
- `date`: `2026-02-28`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["operators", "contributors"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

The resolver can inspect OpenClaw configuration for guidance checks, but direct file mutation would blur ownership and increase risk.

## Decision

Keep OpenClaw integration read-only:

1. Inspect and diagnose OpenClaw config/state as needed.
2. Never create/modify/delete OpenClaw-managed files.
3. Provide snippets and guidance only; user performs manual edits.

## Consequences

- Positive:
  - Clear ownership boundary between tools.
  - Lower risk of unintended config mutation.
- Tradeoffs:
  - Slightly more manual operator workflow.

## Alternatives considered

1. Add auto-apply behavior to edit OpenClaw files.
   - Rejected: violates safety and ownership boundary.
2. Disallow all OpenClaw inspection.
   - Rejected: weakens setup diagnostics and guidance.

## References

- Plans:
  - `docs/plans/002-openclaw-snippet-ux-and-path-guidance.md`
- PRs:
  - N/A
- Commits:
  - `58df7cb`
  - `5fa6db0`
- Docs:
  - `AGENTS.md`
