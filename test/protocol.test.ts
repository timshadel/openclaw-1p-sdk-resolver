import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatResponse, loadConfig, loadEffectiveConfig, parseRequestBuffer } from "../src/protocol.js";

function writeConfig(homeDir: string, body: string): string {
  const dir = path.join(homeDir, ".config", "openclaw-1p-sdk-resolver");
  mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, "config.json");
  writeFileSync(configPath, body, "utf8");
  return configPath;
}

describe("protocol", () => {
  it("parses a valid request", () => {
    const buffer = Buffer.from(JSON.stringify({ protocolVersion: 1, ids: ["A/token"] }));
    const parsed = parseRequestBuffer(buffer, 1024);

    expect(parsed).toEqual({
      protocolVersion: 1,
      ids: ["A/token"]
    });
  });

  it("returns null for invalid json", () => {
    const parsed = parseRequestBuffer(Buffer.from("{not-json"), 1024);
    expect(parsed).toBeNull();
  });

  it("returns null when payload exceeds max bytes", () => {
    const parsed = parseRequestBuffer(Buffer.from("{}"), 1);
    expect(parsed).toBeNull();
  });

  it("accepts payload exactly at max byte limit", () => {
    const body = JSON.stringify({ protocolVersion: 1, ids: ["A/token"] });
    const parsed = parseRequestBuffer(Buffer.from(body), Buffer.byteLength(body));
    expect(parsed).toEqual({
      protocolVersion: 1,
      ids: ["A/token"]
    });
  });

  it("returns null for missing required fields", () => {
    expect(parseRequestBuffer(Buffer.from(JSON.stringify({ ids: [] })), 1024)).toBeNull();
    expect(parseRequestBuffer(Buffer.from(JSON.stringify({ protocolVersion: 1 })), 1024)).toBeNull();
  });

  it("formats response as JSON", () => {
    const output = formatResponse({ protocolVersion: 2, values: { a: "b" } });
    expect(JSON.parse(output)).toEqual({ protocolVersion: 2, values: { a: "b" } });
  });

  it("loads config from file with defaults and caps", () => {
    const home = mkdtempSync(path.join(tmpdir(), "onep-sdk-resolver-home-"));
    writeConfig(
      home,
      JSON.stringify({
        defaultVault: "MainVault",
        vaultPolicy: "default_vault+whitelist",
        vaultWhitelist: ["SharedVault"],
        maxIds: 999,
        maxStdinBytes: 9999999,
        concurrency: 99,
        timeoutMs: 200,
        stdinTimeoutMs: 999999,
        allowedIdRegex: "^[A-Za-z0-9_\\/-]+$"
      })
    );

    const config = loadConfig({ HOME: home });

    expect(config.maxIds).toBe(200);
    expect(config.maxStdinBytes).toBe(1024 * 1024);
    expect(config.concurrency).toBe(10);
    expect(config.timeoutMs).toBe(1000);
    expect(config.stdinTimeoutMs).toBe(120000);
    expect(config.defaultVault).toBe("MainVault");
    expect(config.vaultPolicy).toBe("default_vault+whitelist");
    expect(config.vaultWhitelist).toEqual(["SharedVault"]);
    expect(config.allowedIdRegex?.test("MyAPI/token")).toBe(true);
  });

  it("supports explicit config path override", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "onep-sdk-resolver-config-"));
    const customConfigPath = path.join(dir, "custom.json");
    writeFileSync(customConfigPath, JSON.stringify({ defaultVault: "OverrideVault" }), "utf8");

    const config = loadConfig({ OP_RESOLVER_CONFIG: customConfigPath });
    expect(config.defaultVault).toBe("OverrideVault");
  });

  it("prefers XDG_CONFIG_HOME over HOME", () => {
    const home = mkdtempSync(path.join(tmpdir(), "onep-sdk-resolver-home-"));
    const xdg = mkdtempSync(path.join(tmpdir(), "onep-sdk-resolver-xdg-"));

    writeConfig(home, JSON.stringify({ defaultVault: "HomeVault" }));
    const xdgConfigDir = path.join(xdg, "openclaw-1p-sdk-resolver");
    mkdirSync(xdgConfigDir, { recursive: true });
    writeFileSync(
      path.join(xdgConfigDir, "config.json"),
      JSON.stringify({ defaultVault: "XdgVault" }),
      "utf8"
    );

    const effective = loadEffectiveConfig({ env: { HOME: home, XDG_CONFIG_HOME: xdg } });
    expect(effective.config.defaultVault).toBe("XdgVault");
    expect(effective.path.source).toBe("XDG_CONFIG_HOME");
  });

  it("uses OP_RESOLVER_CONFIG over XDG and HOME", () => {
    const home = mkdtempSync(path.join(tmpdir(), "onep-sdk-resolver-home-"));
    const xdg = mkdtempSync(path.join(tmpdir(), "onep-sdk-resolver-xdg-"));
    const dir = mkdtempSync(path.join(tmpdir(), "onep-sdk-resolver-config-"));
    const overridePath = path.join(dir, "override.json");
    writeFileSync(overridePath, JSON.stringify({ defaultVault: "OverrideVault" }), "utf8");

    writeConfig(home, JSON.stringify({ defaultVault: "HomeVault" }));
    const xdgConfigDir = path.join(xdg, "openclaw-1p-sdk-resolver");
    mkdirSync(xdgConfigDir, { recursive: true });
    writeFileSync(
      path.join(xdgConfigDir, "config.json"),
      JSON.stringify({ defaultVault: "XdgVault" }),
      "utf8"
    );

    const effective = loadEffectiveConfig({
      env: { HOME: home, XDG_CONFIG_HOME: xdg, OP_RESOLVER_CONFIG: overridePath }
    });
    expect(effective.config.defaultVault).toBe("OverrideVault");
    expect(effective.path.source).toBe("OP_RESOLVER_CONFIG");
  });

  it("falls back to defaults when config file is malformed json", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "onep-sdk-resolver-config-"));
    const customConfigPath = path.join(dir, "custom.json");
    writeFileSync(customConfigPath, "{not-json", "utf8");

    const config = loadConfig({ OP_RESOLVER_CONFIG: customConfigPath });
    expect(config.defaultVault).toBe("default");
    expect(config.vaultPolicy).toBe("default_vault");
    expect(config.maxIds).toBe(50);
    expect(config.concurrency).toBe(4);
  });

  it("fails closed for invalid allowlist regex in config", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "onep-sdk-resolver-config-"));
    const customConfigPath = path.join(dir, "custom.json");
    writeFileSync(customConfigPath, JSON.stringify({ allowedIdRegex: "[" }), "utf8");

    const config = loadConfig({ OP_RESOLVER_CONFIG: customConfigPath });
    expect(config.allowedIdRegex?.test("anything")).toBe(false);
  });

  it("falls back to legacy vault key", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "onep-sdk-resolver-config-"));
    const customConfigPath = path.join(dir, "custom.json");
    writeFileSync(customConfigPath, JSON.stringify({ vault: "LegacyVault" }), "utf8");

    const config = loadConfig({ OP_RESOLVER_CONFIG: customConfigPath });
    expect(config.defaultVault).toBe("LegacyVault");
  });

  it("uses default vault policy and vault when omitted", () => {
    const config = loadConfig({});
    expect(config.defaultVault).toBe("default");
    expect(config.vaultPolicy).toBe("default_vault");
    expect(config.vaultWhitelist).toEqual([]);
  });

  it("fuzzes parser with random utf8 payloads without throwing", () => {
    let seed = 1337;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };

    for (let i = 0; i < 300; i += 1) {
      const size = (next() % 512) + 1;
      const bytes = Buffer.alloc(size);
      for (let j = 0; j < size; j += 1) {
        bytes[j] = next() & 0xff;
      }
      const result = parseRequestBuffer(bytes, 1024);
      if (result !== null) {
        expect(Number.isInteger(result.protocolVersion)).toBe(true);
        expect(Array.isArray(result.ids)).toBe(true);
      }
    }
  });
});
