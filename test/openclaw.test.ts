import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectOpenclawReferences,
  parseOpenclawConfigText,
  resolveOpenclawConfigPath,
  scanRepositoryForSecretCandidates,
  suggestOpenclawProviderImprovements
} from "../src/openclaw.js";

describe("openclaw helpers", () => {
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

  it("collects op refs and parses json-with-comments", () => {
    const text = `
      {
        // comment
        "secrets": ["op://Vault/Item/field", "op://Vault/Other/secret",],
      }
    `;
    const refs = collectOpenclawReferences(text);
    expect(refs).toContain("op://Vault/Item/field");
    expect(refs).toContain("op://Vault/Other/secret");
    const parsed = parseOpenclawConfigText(text);
    expect(parsed.parsed).toBeDefined();
  });

  it("returns parse error for invalid openclaw config", () => {
    const parsed = parseOpenclawConfigText("{ this is invalid ");
    expect(parsed.parsed).toBeUndefined();
    expect(parsed.parseError).toBeTruthy();
  });

  it("scans repository for candidate secret literals without exposing values", () => {
    const root = mkdtempSync(path.join(tmpdir(), "openclaw-scan-"));
    writeFileSync(
      path.join(root, ".env"),
      "API_TOKEN=supersecretvalue123456\nONEPASSWORD_REF=op://MainVault/Item/field\nSLACK=xoxb-1234567890123456789012345\n",
      "utf8"
    );
    const findings = scanRepositoryForSecretCandidates({ rootDir: root });
    expect(findings.some((finding) => finding.type === "candidate_for_1password")).toBe(true);
    expect(findings.some((finding) => finding.type === "already_1password")).toBe(true);
    expect(findings.some((finding) => finding.type === "risky_literal")).toBe(true);
    expect(findings[0].fingerprint.includes("sha256=")).toBe(true);
    expect(findings[0].fingerprint.includes("supersecretvalue123456")).toBe(false);
  });

  it("suggests provider improvements based on config text and refs", () => {
    const suggestions = suggestOpenclawProviderImprovements({
      openclawText: '{"providers":[]}',
      references: []
    });
    expect(suggestions.some((line) => line.includes("exec provider"))).toBe(true);
    expect(suggestions.some((line) => line.includes("jsonOnly"))).toBe(true);
  });

  it("returns fewer suggestions when provider looks complete", () => {
    const suggestions = suggestOpenclawProviderImprovements({
      openclawText:
        '{"providers":[{"kind":"exec","config":{"command":"openclaw-1p-sdk-resolver","jsonOnly": true,"passEnv":["OP_SERVICE_ACCOUNT_TOKEN","OP_RESOLVER_CONFIG"]}}]}',
      references: ["op://MainVault/Item/field"]
    });
    expect(suggestions.some((line) => line.includes("No op:// references"))).toBe(false);
    expect(suggestions.some((line) => line.includes("jsonOnly"))).toBe(false);
  });
});
