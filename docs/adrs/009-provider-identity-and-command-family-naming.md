# Provider Identity and Command Family Naming

- `id`: `009-provider-identity-and-command-family-naming`
- `status`: `accepted`
- `date`: `2026-02-28`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["operators", "contributors"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

Naming choices impact clarity, ownership boundaries, and user expectations.
The project needed clear distinction between resolver identity and vendor/product names.

## Decision

Adopt naming conventions:

1. Use `1password` command family with `1p` shorthand.
2. Use default provider alias `1p-sdk-resolver`.
3. Avoid ambiguous provider aliases that appear to impersonate product/organization ownership.

## Consequences

- Positive:
  - Clearer intent and integration semantics.
  - Better alignment with user expectations around ownership.
- Tradeoffs:
  - Requires migration awareness where old naming was used.

## Alternatives considered

1. Keep prior command-group and alias naming.
   - Rejected: ambiguity and weaker distinction.
2. Use fully generic names only (no product cue).
   - Rejected: reduces discoverability of purpose.

## References

- Plans:
  - `docs/plans/002-openclaw-snippet-ux-and-path-guidance.md`
- PRs:
  - N/A
- Commits:
  - `91058c4`
  - `86bfe21`
  - `99ec569`
- Docs:
  - `README.md`
