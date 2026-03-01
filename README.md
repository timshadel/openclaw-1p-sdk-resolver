# openclaw-1p-sdk-resolver

> [!NOTE]
> This resolver design aligns with OpenClaw exec-provider realities and is not 1Password's preferred integration approach. See the detailed analysis: [`Resolver Security Alignment - 1Password Ideal vs OpenClaw Reality`](./docs/reports/resolver-security-alignment-1password-ideal-vs-openclaw-reality.md).

Production-focused OpenClaw `exec` secrets provider (`jsonOnly: true`) that resolves 1Password secret references via the official `@1password/sdk` using service account auth.

## Features

- No-arg mode preserves OpenClaw exec-provider contract: reads request JSON from `stdin` and writes response JSON to `stdout`.
- Adds a safe-by-default CLI with subcommands for config inspection, validation, and guided setup.
- Uses service-account auth only via `OP_SERVICE_ACCOUNT_TOKEN`.
- Fails closed: malformed input, missing token, timeout, or SDK failures return valid JSON with empty `values`.
- Supports explicit `op://...` passthrough and `<item>/<field>` mapping via config-driven default vault.
- Strict caps for `stdin` size, id count, timeout, and concurrency.
- No secret logging in CLI mode; `resolve` output is redacted by default.

## Install

```bash
pnpm add -g openclaw-1p-sdk-resolver
```

Verify:

```bash
openclaw-1p-sdk-resolver --help
```

## Quick Start (2 Minutes)

Assumes `openclaw-1p-sdk-resolver` is installed and available on your `PATH`.

1. Set your service account token:

```bash
export OP_SERVICE_ACCOUNT_TOKEN="..."
```

2. Initialize resolver config (dry-run first, then write):

```bash
openclaw-1p-sdk-resolver config init --default-vault MainVault
openclaw-1p-sdk-resolver config init --default-vault MainVault --write
```

3. Check both sides of the integration:

```bash
openclaw-1p-sdk-resolver openclaw check --strict
openclaw-1p-sdk-resolver 1password check --strict
```

4. Generate provider JSON to paste into `openclaw.json`:

```bash
openclaw-1p-sdk-resolver openclaw snippet
```

## Use In OpenClaw Config

Recommended flow:

1. Validate current setup:

```bash
openclaw-1p-sdk-resolver openclaw check --strict
```

2. Generate provider JSON:

```bash
openclaw-1p-sdk-resolver openclaw snippet > provider-snippet.json
```

See [`OpenClaw Snippet`](#openclaw-snippet) below for snippet output behavior and guidance details.

3. Paste that snippet manually under `secrets.providers` in `openclaw.json`.

Example provider entry:

```json
{
  "secrets": {
    "providers": {
      "1p-sdk-resolver": {
        "source": "exec",
        "command": "/absolute/path/to/openclaw-1p-sdk-resolver",
        "jsonOnly": true,
        "passEnv": ["HOME", "OP_SERVICE_ACCOUNT_TOKEN", "OP_RESOLVER_CONFIG"]
      }
    }
  }
}
```

## OpenClaw Snippet

Generate a provider snippet to paste into `openclaw.json`:

```bash
openclaw-1p-sdk-resolver openclaw snippet
```

The snippet includes:

- `source: "exec"`
- `jsonOnly: true`
- command path guidance
- `passEnv`: `HOME`, `OP_SERVICE_ACCOUNT_TOKEN`, `OP_RESOLVER_CONFIG`
- This tool never edits OpenClaw files; paste snippet output manually.
- Snippet JSON is always written to `stdout`; optional guidance is written to `stderr`.
- Guidance includes likely OpenClaw config path and path-source reasoning.

## Protocol

Input:

```json
{ "protocolVersion": 1, "ids": ["MyAPI/token", "op://Vault/item/field"] }
```

Output:

```json
{ "protocolVersion": 1, "values": { "MyAPI/token": "<secret>" } }
```

Unresolved IDs are omitted from `values`.

## ID Mapping

- If id starts with `op://`, resolver uses it unchanged.
- Otherwise resolver maps with default vault:
  - `MyAPI/token` + `defaultVault: "MainVault"`
  - becomes `op://MainVault/MyAPI/token`

## Runtime Configuration

- `OP_SERVICE_ACCOUNT_TOKEN` (required)
- `OP_RESOLVER_CONFIG` (optional absolute path override for config JSON)

Resolver config is loaded from:

1. `OP_RESOLVER_CONFIG` (explicit path override)
2. `$XDG_CONFIG_HOME/openclaw-1p-sdk-resolver/config.json`
3. `$HOME/.config/openclaw-1p-sdk-resolver/config.json`

Example config JSON:

```json
{
  "defaultVault": "MainVault",
  "vaultPolicy": "default_vault+whitelist",
  "vaultWhitelist": ["SharedVault"],
  "allowedIdRegex": "^[A-Za-z0-9_\\/-]+$",
  "maxIds": 50,
  "maxStdinBytes": 131072,
  "stdinTimeoutMs": 5000,
  "timeoutMs": 25000,
  "concurrency": 4,
  "onePasswordClientName": "openclaw-1p-sdk-resolver",
  "onePasswordClientVersion": "1.0.0"
}
```

Defaults/caps:

- `maxIds`: default `50`, hard cap `200`
- `maxStdinBytes`: default `131072`, hard cap `1048576`
- `timeoutMs`: default `25000`
- `stdinTimeoutMs`: default `5000`
- `concurrency`: default `4`, hard cap `10`
- `onePasswordClientName`: default `openclaw-1p-sdk-resolver` (used as 1Password SDK client metadata)
- `onePasswordClientVersion`: default `1.0.0` (used as 1Password SDK client metadata)
- `defaultVault`: default `"default"` (also supports legacy `vault` key)
- `vaultPolicy`: default `"default_vault"`
  - `"default_vault"`: only configured `defaultVault` allowed for explicit `op://...` refs
  - `"default_vault+whitelist"`: `defaultVault` plus `vaultWhitelist`
  - `"any"`: any explicit vault allowed
- `vaultWhitelist`: default `[]`

Vault source precedence:

- `defaultVault` from config file
- fallback to legacy `vault` config key
- fallback to built-in default `"default"`

Removed keys:

- `integrationName` and `integrationVersion` are no longer recognized.

## CLI Commands

No args means resolver mode. Any recognized subcommand runs CLI mode and does not read protocol stdin.

```bash
openclaw-1p-sdk-resolver doctor [--json]
openclaw-1p-sdk-resolver config path [--json]
openclaw-1p-sdk-resolver config show [--json] [--defaults] [--current-file] [--verbose]
openclaw-1p-sdk-resolver config init [--default-vault <name>] [--write] [--force] [--json]
openclaw-1p-sdk-resolver openclaw check [--path <openclaw.json>] [--provider <alias>] [--json] [--strict] [--details]
openclaw-1p-sdk-resolver openclaw snippet [--provider <alias>] [--command <path>] [--explain] [--quiet]
openclaw-1p-sdk-resolver 1password check [--json] [--strict] [--details] [--probe-id <id>] [--probe-timeout-ms <n>] [--debug]
openclaw-1p-sdk-resolver 1password snippet [--default-vault <name>] [--full] [--json] [--explain] [--quiet]
openclaw-1p-sdk-resolver 1p <check|snippet> [...flags]
openclaw-1p-sdk-resolver resolve --id MyAPI/token [--id Other/item] [--stdin] [--json] [--debug] [--reveal --yes]
```

Notes:

- `doctor` reports config path resolution, effective config, provenance (`default | config-file | env`), validation warnings/errors, and token presence.
- `config init` is dry-run by default; pass `--write` to persist.
- `config init` requires `--default-vault <name>` unless an existing config file is already loaded with `defaultVault`.
- `config init --write` refuses overwrite unless `--force`.
- `openclaw check` is the high-signal setup command:
  - validates OpenClaw config path and provider wiring (read-only)
  - verifies 1Password connectivity sanity (token present + SDK init probe)
  - returns findings with actionable next steps
- `openclaw check --details` provides deeper troubleshooting details including resolver config/provenance.
- `openclaw snippet` prints provider JSON only on `stdout` so it can be pasted directly into OpenClaw config.
- `1password check` is the high-signal 1Password readiness command:
  - validates resolver config
  - checks token presence and SDK init status
  - optionally probes a specific id/ref safely via `--probe-id` (never prints values; probe id echoed only with `--debug`)
- `1password check --details` provides deep resolver and policy diagnostics.
- `--strict` turns findings into non-zero exit code (`1`) for automation gating.
- `1password snippet` prints resolver config JSON only on `stdout` (minimal by default, full config with `--full`).
- This project is pre-release; removed CLI names/flags are not kept as compatibility aliases.
- Snippet instruction text is emitted on `stderr` only:
  - default: only when `stderr` is a TTY
  - `--explain`: force instructions on `stderr`
  - `--quiet`: suppress instructions (`--quiet` wins over `--explain`)
  - includes likely OpenClaw config path and path-source reasoning for paste guidance
  - includes a blank separator line after instructions for readability
- `resolve` is redacted by default and never prints secret values unless `--reveal` is used.
- `resolve --debug` adds safe reason codes for unresolved ids (for example `policy-blocked`, `invalid-ref`, `sdk-unresolved`) without revealing secrets.
- `resolve --reveal` requires explicit consent:
  - pass `--yes` for non-interactive runs
  - without `--yes`, an interactive TTY confirmation prompt is required
- OpenClaw config path resolution precedence used by `openclaw check`:

1. `--path <openclaw.json>`
2. `OPENCLAW_CONFIG_PATH`
3. `OPENCLAW_STATE_DIR/openclaw.json`
4. `OPENCLAW_HOME/openclaw.json`
5. `HOME/.openclaw/openclaw.json`
6. `os.homedir()/.openclaw/openclaw.json`

## Exit Codes

- `0` (`OK`): command succeeded with no blocking issues.
- `1` (`FINDINGS`): command found non-fatal issues while running in `--strict` mode.
- `2` (`ERROR`): configuration/input problem (for example unreadable file or invalid config).
- `3` (`RUNTIME`): runtime dependency failure (for example SDK initialization failure).

## Project Decision Artifacts

This repository keeps decision artifacts in two complementary forms:

- Formal Plans: [`docs/plans/README.md`](./docs/plans/README.md)
  - Pre-implementation plans for major/public changes.
  - For AI-assisted work, this is the record produced in plan mode before execution.
  - Serves as an evolution log of intended work and acceptance criteria.
- ADRs: [`docs/adrs/README.md`](./docs/adrs/README.md)
  - Durable technical and architecture decisions with rationale.
  - Captures enduring constraints that future plans and implementation must respect.

## Versioning

This project follows [Semantic Versioning 2.0.0](https://semver.org/). Pre-1.0 releases (`0.y.z`) may include breaking changes.

## Release Workflow

Releases are CI-driven with [Changesets](https://github.com/changesets/changesets).

- Releases are intentionally triggered via `Release` workflow dispatch (not on every merge).
- Workflow modes:
  - `prepare`: opens/updates a release PR with version/changelog updates.
  - `publish`: publishes from `main` to npm via trusted publishing.
- Publishing runs from GitHub Actions (not developer machines).

Maintainer checklist (one-time setup):

1. In npm package settings for `openclaw-1p-sdk-resolver`, add GitHub repository trusted publishing for this repo/workflow.
2. In GitHub branch protection, require CI checks on `main`.
3. Trigger `Release` with mode `prepare` from `main` to create/update the release PR.
4. Merge the release PR.
5. Trigger `Release` with mode `publish` from `main` to publish intentionally.

Contributor flow:

1. Add a changeset in feature PRs:

```bash
pnpm changeset
```

2. Commit the generated `.changeset/*.md` file with the code change.

## Distribution

- Primary registry: npm (`openclaw-1p-sdk-resolver`).
- GitHub Releases are used for tagged source snapshots/release notes.
- GitHub Packages (npm registry) is not currently used for distribution.
- `dist/` is generated at pack/publish time via `prepack` and is not committed to git.

Minimal starter config generated by `config init`:

```json
{
  "defaultVault": "MainVault",
  "vaultPolicy": "default_vault"
}
```

## Two-Sided Checks

- OpenClaw side:
  - `openclaw-1p-sdk-resolver openclaw check --strict`
  - `openclaw-1p-sdk-resolver openclaw check --details --json`
  - `openclaw-1p-sdk-resolver openclaw snippet`
- 1Password side:
  - `openclaw-1p-sdk-resolver 1password check --strict`
  - `openclaw-1p-sdk-resolver 1password check --probe-id op://Vault/Item/field --json`
  - `openclaw-1p-sdk-resolver 1password check --details --json`
  - `openclaw-1p-sdk-resolver 1password snippet --default-vault MainVault`

## Architecture

Current source layout is intentionally small and split by responsibility:

- `src/protocol.ts`
  - Parses stdin protocol JSON into a strict in-memory shape.
  - Loads/normalizes config with defaults and hard caps.
  - Provides effective config provenance and validation diagnostics.
  - Formats response JSON.
- `src/sanitize.ts`
  - Validates/sanitizes IDs from untrusted input.
  - Maps IDs to `op://` references.
  - Enforces vault policy checks for explicit refs.
- `src/onepassword.ts`
  - Thin adapter over `@1password/sdk` using service account auth.
  - Uses `resolveAll` when available, otherwise concurrency-limited `resolve`.
  - Falls back to per-ref `resolve` when bulk payloads are unsupported/empty.
  - Returns partial success maps; unresolved refs are omitted.
- `src/cli.ts`
  - Handles subcommand routing (`doctor`, `config`, `openclaw`, `1password`, `1p`, `resolve`).
  - Keeps CLI output safe-by-default (no secret values unless explicit reveal).
- `src/openclaw.ts`
  - Resolves OpenClaw config path precedence from env/flags.
  - Parses OpenClaw config and validates resolver provider wiring.
  - Builds provider snippet JSON for OpenClaw config.
- `src/resolver.ts`
  - Entrypoint wiring:
    - no subcommand: resolver mode
    - recognized subcommand: CLI mode
  - Orchestrates the runtime pipeline:
    - read stdin with size/time caps
    - parse request
    - sanitize ids
    - map/enforce vault policy
    - resolve refs
    - emit response
  - Centralizes fail-closed behavior (always valid JSON, empty `values` on failure).

## Limitations

- Protocol scope is intentionally narrow: OpenClaw `exec` provider with `jsonOnly: true`.
- Auth mode is service account token only (`OP_SERVICE_ACCOUNT_TOKEN`).
- Fail-closed behavior does not return per-id error details; unresolved IDs are simply omitted.
- Resolver may return partial success when some refs resolve and others fail.
- Timeouts are best-effort guards and can lead to empty responses under network/SDK delay.
- Vault access is constrained by configured `vaultPolicy` (unless set to `"any"`).
- This process necessarily places resolved secrets on stdout in the protocol response; stdout/stderr transcripts must be treated as sensitive.

## Development Setup

```bash
pnpm install
pnpm build
```

`pnpm publish` runs `prepack` (`pnpm build`) to generate `dist/` before packaging.

## Test

```bash
pnpm test
```

Tests use fake resolver adapters and never call real 1Password.

## Wrapper

A stable executable is provided at:

- `bin/openclaw-1p-sdk-resolver`

It uses a portable Node shebang and a relative built resolver path:

```js
#!/usr/bin/env node
import { runCli } from "../dist/resolver.js";
await runCli();
```

If you want a user-global install, copy this wrapper to:

- `~/.local/bin/openclaw-1p-sdk-resolver`

and update the import path if needed.

## Smoke Test

```bash
echo '{"protocolVersion":1,"ids":["MyAPI/token"]}' | ./bin/openclaw-1p-sdk-resolver
```

This only returns values when `OP_SERVICE_ACCOUNT_TOKEN` is set and the target secret exists in an allowed vault.

## Security Notes

- Never log resolved secret values.
- Never log raw stdin.
- Never pass service account token via CLI args or files.
- `config init --write` uses no-follow safe writes and refuses symlink paths.
- Resolver should emit secrets only in protocol JSON on stdout.
- Errors are treated as unresolved (empty values) to avoid leaking details.

## Troubleshooting

- Missing `OP_SERVICE_ACCOUNT_TOKEN`: resolver returns `{ "values": {} }`.
- Explicit `op://...` ids outside vault policy are dropped before resolve.
- Invalid JSON input: resolver returns empty values.
- Invalid IDs (empty, newline/NUL, `..`, regex mismatch): dropped before resolve.
- Vault permission issues / unknown ref: unresolved IDs are omitted.
- Timeout (`timeoutMs` too low or SDK/network delay): resolver returns empty values.
