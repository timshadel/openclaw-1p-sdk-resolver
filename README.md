# openclaw-1p-sdk-resolver

Production-focused OpenClaw `exec` secrets provider (`jsonOnly: true`) that resolves 1Password secret references via the official `@1password/sdk` using service account auth.

## Features

- Reads request JSON from `stdin` and writes response JSON to `stdout`.
- Uses service-account auth only via `OP_SERVICE_ACCOUNT_TOKEN`.
- Fails closed: malformed input, missing token, timeout, or SDK failures return valid JSON with empty `values`.
- Supports explicit `op://...` passthrough and `<item>/<field>` mapping via config-driven default vault.
- Strict caps for `stdin` size, id count, timeout, and concurrency.
- No secret logging.

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

- `$XDG_CONFIG_HOME/openclaw-1p-sdk-resolver/config.json`, or
- `$HOME/.config/openclaw-1p-sdk-resolver/config.json`

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
  "integrationName": "openclaw-1p-sdk-resolver",
  "integrationVersion": "1.0.0"
}
```

Defaults/caps:

- `maxIds`: default `50`, hard cap `200`
- `maxStdinBytes`: default `131072`, hard cap `1048576`
- `timeoutMs`: default `25000`
- `stdinTimeoutMs`: default `5000`
- `concurrency`: default `4`, hard cap `10`
- `integrationName`: default `openclaw-1p-sdk-resolver`
- `integrationVersion`: default `1.0.0`
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

## Install

```bash
pnpm install
pnpm build
```

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

## OpenClaw Configuration

Example `openclaw.json` provider:

```json
{
  "secrets": {
    "providers": {
      "onepassword_1p_sdk": {
        "source": "exec",
        "command": "$HOME/.local/bin/openclaw-1p-sdk-resolver",
        "args": [],
        "jsonOnly": true,
        "passEnv": [
          "HOME",
          "XDG_CONFIG_HOME",
          "OP_SERVICE_ACCOUNT_TOKEN"
        ],
        "trustedDirs": ["$HOME/.local/bin"],
        "allowSymlinkCommand": false
      }
    }
  }
}
```

## Smoke Test

```bash
echo '{"protocolVersion":1,"ids":["MyAPI/token"]}' | ./bin/openclaw-1p-sdk-resolver
```

This only returns values when `OP_SERVICE_ACCOUNT_TOKEN` is set and the target secret exists in an allowed vault.

## Security Notes

- Never log resolved secret values.
- Never log raw stdin.
- Never pass service account token via CLI args or files.
- Resolver should emit secrets only in protocol JSON on stdout.
- Errors are treated as unresolved (empty values) to avoid leaking details.

## Troubleshooting

- Missing `OP_SERVICE_ACCOUNT_TOKEN`: resolver returns `{ "values": {} }`.
- Explicit `op://...` ids outside vault policy are dropped before resolve.
- Invalid JSON input: resolver returns empty values.
- Invalid IDs (empty, newline/NUL, `..`, regex mismatch): dropped before resolve.
- Vault permission issues / unknown ref: unresolved IDs are omitted.
- Timeout (`timeoutMs` too low or SDK/network delay): resolver returns empty values.
