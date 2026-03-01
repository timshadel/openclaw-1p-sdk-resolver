# Diagnostics Command Cohesion and Flag Model

- `id`: `011-diagnostics-command-cohesion-and-flag-model`
- `status`: `accepted`
- `date`: `2026-03-01`
- `deciders`: `["openclaw-1p-sdk-resolver maintainers"]`
- `consulted`: `[]`
- `informed`: `["operators", "contributors"]`
- `supersedes`: `""`
- `superseded-by`: `""`

## Context

Diagnostics behavior had overlapping naming and semantics:

- subcommands `check` and `diagnose` both executed the same analyzer logic,
- `--check` duplicated the subcommand name but changed exit behavior,
- depth concepts were split across multiple names.

This reduced CLI cohesion and made automation semantics harder to reason about.

## Decision

Adopt a unified diagnostics model:

1. Keep `check` as the single diagnostics action verb.
2. Use `--strict` for findings-to-exit-code behavior.
3. Use `--details` for expanded diagnostic depth.
4. Remove legacy `diagnose` subcommands and `--check` flag.

## Consequences

- Positive:
  - Improved semantic cohesion and naming consistency.
  - Clear separation of concerns: strictness vs output depth.
  - Smaller, easier-to-learn command surface.
- Tradeoffs:
  - Hard rename/removal requires immediate command updates.

## Alternatives considered

1. Keep `diagnose` and `--check` as compatibility aliases.
   - Rejected: project is pre-release; aliases add complexity without migration need.
2. Keep both `check` and `diagnose` as primary subcommands.
   - Rejected: duplicate action semantics with only output-depth difference.

## References

- Plans:
  - `docs/plans/004-cli-cohesion-strict-details.md`
- PRs:
  - N/A
- Commits:
  - pending implementation commit for plan `004`
- Docs:
  - `README.md`
  - `AGENTS.md`
