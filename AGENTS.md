# AGENTS.md

This repository builds a **SecretRef resolver** for **OpenClaw** using the **official 1Password JavaScript SDK** (service account auth), intended to be used as an OpenClaw `exec` secrets provider with `jsonOnly: true`.

This file is written for:
- Humans contributing normally
- AI coding agents working in forks and sending PRs

---

## Non-negotiable safety rules (read first)

1) **Never print secrets**
   - Do not log resolved secret values to stdout/stderr by default.
   - Exception: explicit operator-invoked debug/reveal flows may print secret values only when intentionally gated (for example `resolve --reveal --yes`).
   - Do not write secrets to disk.
   - Do not paste secrets into issues, PR descriptions, commit messages, or test snapshots.

2) **Do not resolve real secrets during tests**
   - Unit/integration tests must use fakes/mocks and must not call 1Password.

3) **Assume transcripts exist**
   - Many agent runners and CLIs persist stdout/stderr transcripts. Treat secret values as toxic.

4) **Fail closed**
   - On malformed input / missing auth / SDK errors: return valid protocol JSON with an empty `values` map and exit successfully.

5) **Never edit OpenClaw config files**
   - This tool may inspect/read OpenClaw config files for diagnostics and suggestions.
   - It must never create, modify, or delete OpenClaw config files (for example `openclaw.json`) directly.
   - Any future "apply" behavior for OpenClaw config is out of scope unless explicitly approved in repository policy.

---

## What we are building

### Runtime mode (OpenClaw exec provider, jsonOnly)
- Input (stdin): JSON request with `protocolVersion` and `ids`.
- Output (stdout): JSON response with `protocolVersion` and `values`.

### CLI mode (diagnostics and setup)
- Human/operator commands for safe configuration checks and setup guidance.
- Includes command families for:
  - `openclaw ...` (provider/config integration checks)
  - `1password ...` / `1p ...` (resolver readiness/policy checks)
  - `config ...` and `doctor` (resolver config and health)
- Must remain safe-by-default (no secret values unless explicitly requested with gated reveal behavior).

### ID mapping rule
- Vault comes from config `defaultVault` (legacy `vault` key still supported)
- For each requested `id`:
  - If it starts with `op://`, treat it as a full 1Password secret reference.
  - Otherwise interpret it as the path after `op://<vault>/`:
    - `MyAPI/token` → `op://<vault>/MyAPI/token`

### Vault policy rule
- `vaultPolicy` controls allowed explicit `op://...` vaults:
  - `default_vault` (default): only `defaultVault`
  - `default_vault+whitelist`: `defaultVault` plus `vaultWhitelist`
  - `any`: allow any vault in explicit refs

---

## Dev commands

- Install: `pnpm install`
- Build: `pnpm build`
- Test: `pnpm test`
- Lint (if present): `pnpm lint`

Before any PR:
- `pnpm test` must pass locally.
- New behavior must include tests.

---

## Architecture expectations

Create/keep these modules separated:

- `src/protocol/*`  
  Parse stdin, enforce size caps, normalize request, format response.

- `src/sanitize/*`  
  Validate `ids` (string, non-empty, no NUL/newlines, reject `..`, optional allowlist via regex).

- `src/onepassword/*`  
  Thin adapter around `@1password/sdk`:
  - uses service account auth only (`OP_SERVICE_ACCOUNT_TOKEN`)
  - supports bulk resolution if available, otherwise concurrency-limited resolve

- `src/resolver/*`  
  Orchestrates: parse → sanitize → map ids → resolve → emit response.
  - Includes CLI entrypoint routing (no-arg resolver mode vs command mode).

No other module may print/log secret values by default.

---

## Testing rules

- Tests must not require a real 1Password account.
- Mock the 1Password adapter and validate:
  - input size cap behavior
  - invalid JSON behavior
  - id sanitation + allowlist
  - mapping `id` → `op://` ref (including passthrough)
  - always returns valid JSON on stdout

Include “partial success” tests where only some ids resolve.

---

## Contribution workflow (humans + agents)

- Use small PRs.
- PR description must include:
  - What changed
  - How it was tested (`pnpm test`)
  - Security impact notes (if any)

## Plan-First Requirement

For any major change, or any change that affects public API/CLI/user interface behavior, contributors and agents must:

1) Create or update a formal plan under `docs/plans/`.
2) Align on the plan before making implementation edits.
3) Link the plan record in PR notes and/or commit context.

Major/public changes include:

- New/removed/renamed commands, flags, environment variables, or config keys.
- Output schema changes or exit-code behavior changes.
- User-visible behavior changes in command output or interaction flow.
- Protocol-path changes or cross-module refactors that can affect integrations.

Exceptions (plan not required):

- Typo-only documentation fixes.
- Comment-only cleanup.
- Tests that do not change behavior contracts.

## ADR Requirement

For architecture-impacting decisions, contributors and agents must add or update an ADR under `docs/adrs/`.

Architecture-impacting decisions include:

- Test coverage threshold policy.
- Architecture seam and process-boundary decisions.
- Core module boundary refactors.
- Output/contract governance policy.
- Dependency strategy that affects runtime architecture.

For major/public changes:

1) Formal plan in `docs/plans/` first.
2) ADR when the decision has long-term architectural consequences.

Exceptions (ADR not required):

- Typo-only documentation fixes.
- Comment-only cleanup.
- Behavior-neutral tests.

Agents in forks:
- Do not add new runtime dependencies without justification.
- Pin deps via lockfile.
- Prefer deterministic tooling (`pnpm` + lockfile).

---

## References (copy/paste)

OpenClaw secrets protocol:

https://docs.openclaw.ai/gateway/secrets#exec-provider

1Password SDK (service account auth):

https://github.com/1Password/onepassword-sdk-js
