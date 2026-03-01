import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OPENCLAW_PROVIDER_ALIAS,
  buildResolverProviderSnippet,
  checkOpenclawProviderSetup,
  parseOpenclawConfigText,
  resolveOpenclawConfigPath
} from "../src/openclaw.js";

describe("openclaw helpers", () => {
  it("returns unresolved source when HOME and homedir are unavailable", async () => {
    vi.resetModules();
    vi.doMock("node:os", () => ({
      homedir: () => ""
    }));

    const mocked = await import("../src/openclaw.js");
    const resolution = mocked.resolveOpenclawConfigPath({
      env: {
        HOME: "",
        OPENCLAW_CONFIG_PATH: "",
        OPENCLAW_STATE_DIR: "",
        OPENCLAW_HOME: ""
      }
    });
    expect(resolution.source).toBe("unresolved");
    expect(resolution.path).toBeUndefined();

    vi.doUnmock("node:os");
    vi.resetModules();
  });

  it("prefers explicit path flag over env and handles unresolved env state", () => {
    const root = mkdtempSync(path.join(tmpdir(), "openclaw-explicit-"));
    const explicitPath = path.join(root, "cli-path.json");
    writeFileSync(explicitPath, "{}", "utf8");
    const preferred = resolveOpenclawConfigPath({
      env: {
        OPENCLAW_CONFIG_PATH: "/ignore/me.json"
      },
      explicitPath
    });
    expect(preferred.source).toBe("flag");
    expect(preferred.path).toBe(explicitPath);

    const unresolved = resolveOpenclawConfigPath({
      env: {
        HOME: ""
      }
    });
    expect(unresolved.source === "unresolved" || unresolved.source === "homedir").toBe(true);
  });

  it("resolves openclaw config path with correct env precedence", () => {
    const root = mkdtempSync(path.join(tmpdir(), "openclaw-precedence-"));
    const fromConfigPath = path.join(root, "explicit.json");
    const stateDir = path.join(root, "state");
    const openclawHome = path.join(root, "openclaw-home");
    const home = path.join(root, "home");
    mkdirSync(stateDir, { recursive: true });
    mkdirSync(openclawHome, { recursive: true });
    mkdirSync(path.join(home, ".openclaw"), { recursive: true });

    writeFileSync(fromConfigPath, "{}", "utf8");
    writeFileSync(path.join(stateDir, "openclaw.json"), "{}", "utf8");
    writeFileSync(path.join(openclawHome, "openclaw.json"), "{}", "utf8");
    writeFileSync(path.join(home, ".openclaw", "openclaw.json"), "{}", "utf8");

    const r1 = resolveOpenclawConfigPath({
      env: {
        OPENCLAW_CONFIG_PATH: fromConfigPath,
        OPENCLAW_STATE_DIR: stateDir,
        OPENCLAW_HOME: openclawHome,
        HOME: home
      }
    });
    expect(r1.source).toBe("OPENCLAW_CONFIG_PATH");

    const r2 = resolveOpenclawConfigPath({
      env: {
        OPENCLAW_STATE_DIR: stateDir,
        OPENCLAW_HOME: openclawHome,
        HOME: home
      }
    });
    expect(r2.source).toBe("OPENCLAW_STATE_DIR");

    const r3 = resolveOpenclawConfigPath({
      env: {
        OPENCLAW_HOME: openclawHome,
        HOME: home
      }
    });
    expect(r3.source).toBe("OPENCLAW_HOME");

    const r4 = resolveOpenclawConfigPath({ env: { HOME: home } });
    expect(r4.source).toBe("HOME");
  });

  it("parses json-with-comments and returns error for malformed config", () => {
    const text = `
      {
        // comment
        "providers": [
          { "name": "custom_provider", "kind": "exec", "config": { "jsonOnly": true } },
        ],
      }
    `;
    const parsed = parseOpenclawConfigText(text);
    expect(parsed.parsed).toBeDefined();

    const malformed = parseOpenclawConfigText("{ this is invalid ");
    expect(malformed.parsed).toBeUndefined();
    expect(malformed.parseError).toBeTruthy();
  });

  it("builds provider snippet with required fields", () => {
    const snippet = buildResolverProviderSnippet({
      commandHint: "/abs/path/openclaw-1p-sdk-resolver",
      providerAlias: "custom_provider"
    });
    const provider = snippet.secrets.providers.custom_provider;
    expect(provider.source).toBe("exec");
    expect(provider.command).toBe("/abs/path/openclaw-1p-sdk-resolver");
    expect(provider.jsonOnly).toBe(true);
    expect(provider.passEnv).toEqual(["HOME", "OP_SERVICE_ACCOUNT_TOKEN", "OP_RESOLVER_CONFIG"]);
  });

  it("uses default provider alias when omitted or blank", () => {
    const omitted = buildResolverProviderSnippet({
      commandHint: "/abs/path/openclaw-1p-sdk-resolver"
    });
    expect(omitted.secrets.providers[DEFAULT_OPENCLAW_PROVIDER_ALIAS]).toBeDefined();

    const blank = buildResolverProviderSnippet({
      commandHint: "/abs/path/openclaw-1p-sdk-resolver",
      providerAlias: "   "
    });
    expect(blank.secrets.providers[DEFAULT_OPENCLAW_PROVIDER_ALIAS]).toBeDefined();
  });

  it("detects provider setup problems and passes valid config", () => {
    const missing = checkOpenclawProviderSetup({ parsedConfig: { providers: [] }, providerAlias: "custom_provider" });
    expect(missing.providerFound).toBe(false);
    expect(missing.findings.some((finding) => finding.code === "provider_missing")).toBe(true);

    const bad = checkOpenclawProviderSetup({
      parsedConfig: {
        providers: [
          {
            name: "custom_provider",
            kind: "file",
            config: {
              jsonOnly: false,
              passEnv: ["HOME"]
            }
          }
        ]
      },
      providerAlias: "custom_provider"
    });
    expect(bad.providerFound).toBe(true);
    expect(bad.findings.some((finding) => finding.code === "provider_kind_mismatch")).toBe(true);
    expect(bad.findings.some((finding) => finding.code === "provider_json_only_missing")).toBe(true);
    expect(bad.findings.some((finding) => finding.code === "provider_command_missing")).toBe(true);
    expect(bad.findings.some((finding) => finding.code === "provider_passenv_missing")).toBe(true);

    const good = checkOpenclawProviderSetup({
      parsedConfig: {
        secrets: {
          providers: [
            {
              name: "custom_provider",
              kind: "exec",
              config: {
                jsonOnly: true,
                command: "/abs/path/openclaw-1p-sdk-resolver",
                passEnv: ["HOME", "OP_SERVICE_ACCOUNT_TOKEN", "OP_RESOLVER_CONFIG"]
              }
            }
          ]
        }
      },
      providerAlias: "custom_provider"
    });
    expect(good.providerFound).toBe(true);
    expect(good.findings).toHaveLength(0);
  });

  it("matches provider by command fallback and handles invalid provider containers", () => {
    const byCommand = checkOpenclawProviderSetup({
      parsedConfig: {
        providers: [
          {
            name: "different-name",
            kind: "exec",
            config: {
              jsonOnly: true,
              command: "/usr/local/bin/openclaw-1p-sdk-resolver",
              passEnv: ["HOME", "OP_SERVICE_ACCOUNT_TOKEN", "OP_RESOLVER_CONFIG", 42]
            }
          }
        ]
      },
      providerAlias: "custom_provider"
    });
    expect(byCommand.providerFound).toBe(true);
    expect(byCommand.findings).toHaveLength(0);

    const invalidContainers = checkOpenclawProviderSetup({
      parsedConfig: {
        secrets: {
          providers: "not-an-array"
        }
      },
      providerAlias: "custom_provider"
    });
    expect(invalidContainers.providerFound).toBe(false);
    expect(invalidContainers.findings.some((finding) => finding.code === "provider_missing")).toBe(true);
  });
});
