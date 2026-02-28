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
      env: createConfigEnv({ vault: "MainVault" })
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
        ...createConfigEnv({ vault: "MainVault" }),
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
        ...createConfigEnv({ vault: "MainVault", allowedIdRegex: "^[A-Za-z0-9_\\/-]+$" }),
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
        ...createConfigEnv({ vault: "MainVault", timeoutMs: 1 }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      resolver
    });

    expect(parseOutput(out.text)).toEqual({ protocolVersion: 1, values: {} });
  });

  it("returns empty values when vault is missing", async () => {
    const out = new CaptureWritable();

    await runResolver({
      stdin: stdinFrom(JSON.stringify({ protocolVersion: 1, ids: ["MyAPI/token"] })),
      stdout: out,
      env: { OP_SERVICE_ACCOUNT_TOKEN: "token" }
    });

    expect(parseOutput(out.text)).toEqual({ protocolVersion: 1, values: {} });
  });

  it("enforces stdin max bytes", async () => {
    const stream = stdinFrom("123456");
    const result = await readStdinWithLimit(stream, 3);
    expect(result.ok).toBe(false);
  });
});
