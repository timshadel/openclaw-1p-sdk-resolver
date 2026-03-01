# CI Quality Gates

This document defines the repository quality gate contract and rollout policy.

## Stable Status Check Names

- `ci/test`
- `ci/coverage`
- `ci/docs`
- `ci/workflow-lint`
- `security/dependency-review`
- `security/codeql`
- `security/scorecard` (advisory)

## Gate Mapping

| Check | Purpose | Mode (current) | Phase 1 target | Related ADRs |
|---|---|---|---|---|
| `ci/test` | Build + unit/regression tests on Node matrix | enforce | required | `010`, `012` |
| `ci/coverage` | Threshold + regression checks against baseline | observe | required | `010`, `013` |
| `ci/docs` | README/help sync + docs/comment consistency + governance checks | observe | required | `008`, `010`, `013` |
| `ci/workflow-lint` | Validate workflow syntax/security patterns with actionlint | observe | required | `013` |
| `security/dependency-review` | Detect vulnerable dependency/license risk in PR deltas | observe | required | `013` |
| `security/codeql` | JS/TS static security analysis on PR/main/schedule | observe on PR, enforce on main | required on main | `012`, `013` |
| `security/scorecard` | Scheduled supply-chain posture signal | advisory | advisory | `013` |

## Documentation and Comment Consistency

`ci/docs` includes checks that enforce consistency between:

1. CLI command surface in code (`--help`) and README command documentation.
2. Architecture module entries in README and file-level code comments for core modules.
3. Sensitive change scope and required governance records (`docs/plans`, `docs/adrs`).

## Local Preflight

Run locally before opening a PR:

```bash
pnpm build
pnpm test
pnpm test:coverage
pnpm check:coverage
pnpm check:docs
pnpm check:governance
```

## Branch Ruleset Setup (GitHub UI)

Apply in GitHub repository settings:

1. Require pull request before merge.
2. Require one human approval.
3. Require status checks to pass:
   - `ci/test`
   - `ci/coverage`
   - `ci/docs`
   - `ci/workflow-lint`
   - `security/dependency-review`
4. Keep `security/scorecard` advisory-only.
5. Enable secret scanning push protection.
