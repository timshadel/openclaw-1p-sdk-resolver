# AGENTS.md

This repository builds a **SecretRef resolver** for **OpenClaw** using the **official 1Password JavaScript SDK** (service account auth), intended to be used as an OpenClaw `exec` secrets provider with `jsonOnly: true`.

This file is written for:
- Humans contributing normally
- AI coding agents working in forks and sending PRs

---

## Non-negotiable safety rules (read first)

1) **Never print secrets**
   - Do not log resolved secret values (stdout OR stderr).
   - Do not write secrets to disk.
   - Do not paste secrets into issues, PR descriptions, commit messages, or test snapshots.

2) **Do not resolve real secrets during tests**
   - Unit/integration tests must use fakes/mocks and must not call 1Password.

3) **Assume transcripts exist**
   - Many agent runners and CLIs persist stdout/stderr transcripts. Treat secret values as toxic.

4) **Fail closed**
   - On malformed input / missing auth / SDK errors: return valid protocol JSON with an empty `values` map and exit successfully.

---

## What we are building

### Runtime mode (OpenClaw exec provider, jsonOnly)
- Input (stdin): JSON request with `protocolVersion` and `ids`.
- Output (stdout): JSON response with `protocolVersion` and `values`.

### ID mapping rule
- Vault comes from `OP_VAULT`
- For each requested `id`:
  - If it starts with `op://`, treat it as a full 1Password secret reference.
  - Otherwise interpret it as the path after `op://<vault>/`:
    - `MyAPI/token` → `op://<vault>/MyAPI/token`

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

No other module may print/log secret values.

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
