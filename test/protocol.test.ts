import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatResponse, loadConfig, parseRequestBuffer } from "../src/protocol.js";

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
        vault: "MainVault",
        maxIds: 999,
        maxStdinBytes: 9999999,
        concurrency: 99,
        timeoutMs: 200,
        allowedIdRegex: "^[A-Za-z0-9_\\/-]+$"
      })
    );

    const config = loadConfig({ HOME: home });

    expect(config.maxIds).toBe(200);
    expect(config.maxStdinBytes).toBe(1024 * 1024);
    expect(config.concurrency).toBe(10);
    expect(config.timeoutMs).toBe(1000);
    expect(config.vault).toBe("MainVault");
    expect(config.allowedIdRegex?.test("MyAPI/token")).toBe(true);
  });

  it("supports explicit config path override", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "onep-sdk-resolver-config-"));
    const customConfigPath = path.join(dir, "custom.json");
    writeFileSync(customConfigPath, JSON.stringify({ vault: "OverrideVault" }), "utf8");

    const config = loadConfig({ OP_RESOLVER_CONFIG: customConfigPath });
    expect(config.vault).toBe("OverrideVault");
  });
});
