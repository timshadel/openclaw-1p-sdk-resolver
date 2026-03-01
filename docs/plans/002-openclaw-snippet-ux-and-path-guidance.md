# OpenClaw Snippet UX and Path Guidance

- `id`: `002-openclaw-snippet-ux-and-path-guidance`
- `status`: `completed`
- `owners`: `openclaw-1p-sdk-resolver maintainers`
- `created`: `2026-02-28`
- `updated`: `2026-02-28`
- `related-issues`: `[]`
- `related-prs`: `[]`

## Summary

Improve `openclaw snippet` human guidance by including likely OpenClaw config path information and adding a visual separator between instruction text and snippet JSON output, while preserving machine-safe JSON on stdout.

## Scope

### In scope

- Add path guidance to `openclaw snippet` instructions.
- Add blank-line separator after instruction block.
- Keep stdout/stderr output channel contract unchanged.
- Update tests and README documentation for the revised instruction behavior.

### Out of scope

- Changes to snippet JSON schema.
- New CLI flags or modes.
- Any writes to OpenClaw config files.

## Public Interface Impact

No JSON schema changes. Human guidance text on `stderr` for `openclaw snippet` now includes:

- Likely OpenClaw config path.
- Path source and reasoning.
- A trailing blank line separator.

## Implementation Steps

1. Update `runOpenclawSnippet` to resolve OpenClaw config path via existing resolver helper.
2. Expand instruction text with path and source details.
3. Add helper support for a trailing blank line in snippet instruction output.
4. Update CLI tests for new instruction lines and separator behavior.
5. Update README snippet guidance documentation.

## Tests and Acceptance Criteria

### Tests

- `pnpm test`
- `openclaw snippet` tests for:
  - TTY default instruction block content.
  - `--explain` non-TTY instruction block content.
  - `--quiet` suppression and `--quiet --explain` precedence.
  - JSON-only stdout regression checks.

### Acceptance Criteria

- `openclaw snippet` stdout remains JSON-only.
- `openclaw snippet` stderr guidance includes path + source + reason when enabled.
- A blank line separates guidance block from JSON flow in terminal output.
- Existing contract and safety behavior remain unchanged.
- Tests pass.

## Assumptions and Defaults

- “Likely OpenClaw config path” is based on resolver precedence and may point to a non-existent file.
- If no path is resolvable, instruction prints `unresolved`.

## Rollout and Compatibility Notes

- Backward-compatible for automation and scripts consuming stdout JSON.
- Human output becomes more informative for interactive usage.
