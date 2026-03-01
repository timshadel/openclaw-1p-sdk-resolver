# CLI Surface and Output Contracts

- `id`: `008-cli-surface-and-output-contracts`
- `status`: `accepted`
- `date`: `2026-02-28`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["integrators", "operators"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

The binary has dual roles: OpenClaw exec-provider protocol mode and human/operator CLI mode.
Automation compatibility requires stable stream and command contracts.

## Decision

Define CLI/runtime contract:

1. No-arg invocation remains resolver protocol mode (`stdin` request -> `stdout` response).
2. Recognized subcommands run CLI mode and do not consume protocol stdin.
3. Snippet commands keep JSON on `stdout`, human guidance on `stderr`.

## Consequences

- Positive:
  - Preserves OpenClaw integration compatibility.
  - Improves operator UX without breaking automation.
- Tradeoffs:
  - Requires disciplined stream handling across commands.

## Alternatives considered

1. Merge protocol and CLI outputs in a single stream.
   - Rejected: breaks machine parsing contracts.
2. Require explicit mode flags for resolver protocol.
   - Rejected: would break existing OpenClaw exec-provider behavior.

## References

- Plans:
  - `docs/plans/002-openclaw-snippet-ux-and-path-guidance.md`
- PRs:
  - N/A
- Commits:
  - `d4733c7`
  - `99ec569`
  - `261b54a`
- Docs:
  - `README.md`
