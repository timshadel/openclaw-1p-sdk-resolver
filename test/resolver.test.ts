import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { SecretResolver } from "../src/onepassword.js";
import { readStdinWithLimit, runResolver } from "../src/resolver.js";

class CaptureWritable extends Writable {
  public text = "";

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.text += chunk.toString();
    callback();
  }
}

function stdinFrom(value: string): PassThrough {
  const stream = new PassThrough();
  stream.end(value);
  return stream;
}

function parseOutput(output: string): { protocolVersion: number; values: Record<string, string> } {
  return JSON.parse(output.trim()) as { protocolVersion: number; values: Record<string, string> };
}

function createConfigEnv(config: Record<string, unknown>): NodeJS.ProcessEnv {
  const home = mkdtempSync(path.join(tmpdir(), "onep-sdk-resolver-home-"));
  const configDir = path.join(home, ".config", "openclaw-1p-sdk-resolver");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, "config.json"), JSON.stringify(config), "utf8");
  return { HOME: home };
}

describe("resolver", () => {
  it("always returns valid JSON for invalid request", async () => {
    const out = new CaptureWritable();

    await runResolver({
      stdin: stdinFrom("not json"),
      stdout: out,
      env: {}
    });

    expect(parseOutput(out.text)).toEqual({ protocolVersion: 1, values: {} });
  });

  it("returns empty values when token is missing", async () => {
    const out = new CaptureWritable();

    await runResolver({
      stdin: stdinFrom(JSON.stringify({ protocolVersion: 3, ids: ["A/token"] })),
      stdout: out,
      env: createConfigEnv({ defaultVault: "MainVault" })
    });

    expect(parseOutput(out.text)).toEqual({ protocolVersion: 3, values: {} });
  });

  it("resolves partial success and preserves original ids", async () => {
    const out = new CaptureWritable();

    const resolver: SecretResolver = {
      async resolveRefs(refs) {
        const values = new Map<string, string>();
        values.set(refs[0], "secret-a");
        return values;
      }
    };

    await runResolver({
      stdin: stdinFrom(JSON.stringify({ protocolVersion: 1, ids: ["ServiceA/token", "ServiceB/token"] })),
      stdout: out,
      env: {
        ...createConfigEnv({ defaultVault: "MainVault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      resolver
    });

    expect(parseOutput(out.text)).toEqual({
      protocolVersion: 1,
      values: {
        "ServiceA/token": "secret-a"
      }
    });
  });

  it("omits invalid ids using allowlist", async () => {
    const out = new CaptureWritable();

    const resolver: SecretResolver = {
      async resolveRefs(refs) {
        const values = new Map<string, string>();
        values.set(refs[0], "secret-a");
        return values;
      }
    };

    await runResolver({
      stdin: stdinFrom(JSON.stringify({ protocolVersion: 9, ids: ["allowed/token", "blocked token"] })),
      stdout: out,
      env: {
        ...createConfigEnv({ defaultVault: "MainVault", allowedIdRegex: "^[A-Za-z0-9_\\/-]+$" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      resolver
    });

    expect(parseOutput(out.text)).toEqual({
      protocolVersion: 9,
      values: {
        "allowed/token": "secret-a"
      }
    });
  });

  it("returns empty values on resolver timeout", async () => {
    const out = new CaptureWritable();

    const resolver: SecretResolver = {
      async resolveRefs() {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return new Map<string, string>();
      }
    };

    await runResolver({
      stdin: stdinFrom(JSON.stringify({ protocolVersion: 1, ids: ["a"] })),
      stdout: out,
      env: {
        ...createConfigEnv({ defaultVault: "MainVault", timeoutMs: 1 }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      resolver
    });

    expect(parseOutput(out.text)).toEqual({ protocolVersion: 1, values: {} });
  });

  it("uses default vault when config omits it", async () => {
    const out = new CaptureWritable();

    const resolver: SecretResolver = {
      async resolveRefs(refs) {
        const values = new Map<string, string>();
        values.set(refs[0], "secret-a");
        return values;
      }
    };

    await runResolver({
      stdin: stdinFrom(JSON.stringify({ protocolVersion: 1, ids: ["MyAPI/token"] })),
      stdout: out,
      env: { OP_SERVICE_ACCOUNT_TOKEN: "token" },
      resolver
    });

    expect(parseOutput(out.text)).toEqual({
      protocolVersion: 1,
      values: { "MyAPI/token": "secret-a" }
    });
  });

  it("blocks explicit refs outside default vault policy", async () => {
    const out = new CaptureWritable();

    const resolver: SecretResolver = {
      async resolveRefs(refs) {
        const values = new Map<string, string>();
        for (const ref of refs) {
          values.set(ref, "secret-a");
        }
        return values;
      }
    };

    await runResolver({
      stdin: stdinFrom(
        JSON.stringify({
          protocolVersion: 1,
          ids: ["op://MainVault/MyAPI/token", "op://OtherVault/MyAPI/token"]
        })
      ),
      stdout: out,
      env: {
        OP_SERVICE_ACCOUNT_TOKEN: "token",
        ...createConfigEnv({ defaultVault: "MainVault", vaultPolicy: "default_vault" })
      },
      resolver
    });

    expect(parseOutput(out.text)).toEqual({
      protocolVersion: 1,
      values: {
        "op://MainVault/MyAPI/token": "secret-a"
      }
    });
  });

  it("allows explicit refs in whitelist when policy permits", async () => {
    const out = new CaptureWritable();

    const resolver: SecretResolver = {
      async resolveRefs(refs) {
        const values = new Map<string, string>();
        for (const ref of refs) {
          values.set(ref, "secret-a");
        }
        return values;
      }
    };

    await runResolver({
      stdin: stdinFrom(
        JSON.stringify({
          protocolVersion: 1,
          ids: ["op://MainVault/MyAPI/token", "op://SharedVault/MyAPI/token"]
        })
      ),
      stdout: out,
      env: {
        OP_SERVICE_ACCOUNT_TOKEN: "token",
        ...createConfigEnv({
          defaultVault: "MainVault",
          vaultPolicy: "default_vault+whitelist",
          vaultWhitelist: ["SharedVault"]
        })
      },
      resolver
    });

    expect(parseOutput(out.text)).toEqual({
      protocolVersion: 1,
      values: {
        "op://MainVault/MyAPI/token": "secret-a",
        "op://SharedVault/MyAPI/token": "secret-a"
      }
    });
  });

  it("enforces stdin max bytes", async () => {
    const stream = stdinFrom("123456");
    const result = await readStdinWithLimit(stream, 3, 1000);
    expect(result.ok).toBe(false);
  });

  it("accepts stdin payload exactly at byte limit", async () => {
    const stream = stdinFrom("123");
    const result = await readStdinWithLimit(stream, 3, 1000);
    expect(result.ok).toBe(true);
    expect(result.buffer.toString("utf8")).toBe("123");
  });

  it("times out stdin read when stream does not end", async () => {
    const stream = new PassThrough();
    const started = Date.now();
    const result = await readStdinWithLimit(stream, 1024, 20);
    const elapsed = Date.now() - started;

    expect(result.ok).toBe(false);
    expect(elapsed).toBeGreaterThanOrEqual(15);
    expect(elapsed).toBeLessThan(1000);
  });

  it("caps processed ids at maxIds under large input", async () => {
    const out = new CaptureWritable();
    const ids = Array.from({ length: 300 }, (_, i) => `Service${i}/token`);

    const resolver: SecretResolver = {
      async resolveRefs(refs) {
        expect(refs.length).toBe(200);
        const values = new Map<string, string>();
        for (const ref of refs) {
          values.set(ref, "secret");
        }
        return values;
      }
    };

    await runResolver({
      stdin: stdinFrom(JSON.stringify({ protocolVersion: 1, ids })),
      stdout: out,
      env: {
        ...createConfigEnv({ defaultVault: "MainVault", maxIds: 999 }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      resolver
    });

    const parsed = parseOutput(out.text);
    expect(Object.keys(parsed.values)).toHaveLength(200);
    expect(parsed.values["Service0/token"]).toBe("secret");
    expect(parsed.values["Service199/token"]).toBe("secret");
    expect(parsed.values["Service250/token"]).toBeUndefined();
  });
});
