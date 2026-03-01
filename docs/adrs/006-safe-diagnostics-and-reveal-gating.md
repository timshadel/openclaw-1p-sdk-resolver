# Safe Diagnostics and Reveal Gating

- `id`: `006-safe-diagnostics-and-reveal-gating`
- `status`: `accepted`
- `date`: `2026-02-28`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["operators", "contributors"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

Diagnostic commands are useful for operations but risk leaking secrets through logs and transcripts.

## Decision

Adopt safe-by-default diagnostics:

1. Diagnostics commands do not emit secret values.
2. `resolve` output is redacted by default.
3. Secret reveal path requires explicit operator intent and gating (`--reveal` and confirmation/`--yes`).

## Consequences

- Positive:
  - Better safety in shared logs and transcripts.
  - Deliberate operator flow for sensitive output.
- Tradeoffs:
  - Extra steps for troubleshooting live values.

## Alternatives considered

1. Always show resolved values in diagnostics.
   - Rejected: high leakage risk.
2. Disable reveal support entirely.
   - Rejected: insufficient for advanced debugging use cases.

## References

- Plans:
  - `docs/plans/002-openclaw-snippet-ux-and-path-guidance.md`
- PRs:
  - N/A
- Commits:
  - `bb11da2`
  - `527e800`
  - `7d8edbc`
- Docs:
  - `AGENTS.md`
  - `README.md`
