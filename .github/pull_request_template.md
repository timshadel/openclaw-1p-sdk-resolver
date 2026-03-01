## Summary

<!-- What changed and why? -->

## Testing

<!-- Show exact commands run and outcomes. -->
- `pnpm test`
- `pnpm test:coverage`
- `pnpm check:docs`

## Security Notes

<!-- Required for this repository's threat model. -->
- [ ] No secret values were logged to stdout/stderr
- [ ] No real 1Password secret resolution was used in tests
- [ ] Fail-closed behavior preserved (`values: {}` on malformed input/auth/sdk errors)

## Checklist

- [ ] Scope is minimal and focused
- [ ] New behavior includes tests
- [ ] No new runtime dependencies, or justification is included
- [ ] Plan/ADR docs were updated when required by policy
