import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";
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

function stdinFromChunks(chunks: string[], delayMs: number): Readable {
  async function* generate(): AsyncGenerator<string> {
    for (const chunk of chunks) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      yield chunk;
    }
  }
  return Readable.from(generate());
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

  it("drops secret references with url-like syntax invalid for 1password", async () => {
    const out = new CaptureWritable();

    const resolver: SecretResolver = {
      async resolveRefs(refs) {
        expect(refs).toEqual(["op://MainVault/ServiceA/token"]);
        return new Map([[refs[0], "secret-a"]]);
      }
    };

    await runResolver({
      stdin: stdinFrom(
        JSON.stringify({
          protocolVersion: 1,
          ids: [
            "ServiceA/token",
            "op://MainVault/item/field?x=1",
            "op://MainVault/item/field#frag",
            "op://MainVault/http://evil/field",
            "http://example.com/path"
          ]
        })
      ),
      stdout: out,
      env: {
        ...createConfigEnv({ defaultVault: "MainVault", vaultPolicy: "any" }),
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

  it("returns empty values on resolver timeout", async () => {
    const out = new CaptureWritable();

    const resolver: SecretResolver = {
      async resolveRefs() {
        // Simulate a hung resolver call (e.g. subprocess never fully exits).
        await new Promise<never>(() => {
          // Intentionally never resolves/rejects.
        });
        return new Map<string, string>();
      }
    };

    const started = Date.now();
    await runResolver({
      stdin: stdinFrom(JSON.stringify({ protocolVersion: 1, ids: ["A/token"] })),
      stdout: out,
      env: {
        ...createConfigEnv({ defaultVault: "MainVault", timeoutMs: 1 }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      resolver
    });
    const elapsed = Date.now() - started;

    expect(parseOutput(out.text)).toEqual({ protocolVersion: 1, values: {} });
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThan(5000);
  });

  it("returns empty values when resolver is killed", async () => {
    const out = new CaptureWritable();

    const resolver: SecretResolver = {
      async resolveRefs() {
        const error = new Error("resolver process killed");
        (error as Error & { code?: string; signal?: string }).code = "ERR_CHILD_PROCESS_KILLED";
        (error as Error & { code?: string; signal?: string }).signal = "SIGKILL";
        throw error;
      }
    };

    await runResolver({
      stdin: stdinFrom(JSON.stringify({ protocolVersion: 1, ids: ["MyAPI/token"] })),
      stdout: out,
      env: {
        ...createConfigEnv({ defaultVault: "MainVault" }),
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

  it("allows explicit refs in any-vault policy", async () => {
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
          ids: ["op://UnknownVault/MyAPI/token"]
        })
      ),
      stdout: out,
      env: {
        OP_SERVICE_ACCOUNT_TOKEN: "token",
        ...createConfigEnv({
          defaultVault: "MainVault",
          vaultPolicy: "any"
        })
      },
      resolver
    });

    expect(parseOutput(out.text)).toEqual({
      protocolVersion: 1,
      values: {
        "op://UnknownVault/MyAPI/token": "secret-a"
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

  it("returns empty values if stdin stream errors while reading", async () => {
    const out = new CaptureWritable();
    const stream = new PassThrough();
    stream.write('{"protocolVersion":1,"ids":');
    stream.destroy(new Error("stream-failure"));

    await runResolver({
      stdin: stream,
      stdout: out,
      env: { OP_SERVICE_ACCOUNT_TOKEN: "token" }
    });

    expect(parseOutput(out.text)).toEqual({ protocolVersion: 1, values: {} });
  });

  it("accepts slow chunked stdin payload within timeout", async () => {
    const out = new CaptureWritable();
    const payload = JSON.stringify({ protocolVersion: 1, ids: ["ServiceA/token"] });
    const chunks = [payload.slice(0, 10), payload.slice(10, 22), payload.slice(22)];

    const resolver: SecretResolver = {
      async resolveRefs(refs) {
        return new Map([[refs[0], "secret-a"]]);
      }
    };

    await runResolver({
      stdin: stdinFromChunks(chunks, 2),
      stdout: out,
      env: {
        ...createConfigEnv({
          defaultVault: "MainVault",
          stdinTimeoutMs: 1000
        }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      resolver
    });

    expect(parseOutput(out.text)).toEqual({
      protocolVersion: 1,
      values: { "ServiceA/token": "secret-a" }
    });
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

  it("handles near-max stdin payload with maxed config caps applied", async () => {
    const out = new CaptureWritable();
    const ids = Array.from({ length: 250 }, (_, i) => `Service${i}/token`);
    const maxBytes = 1024 * 1024;

    const basePayload = {
      protocolVersion: 1,
      ids
    };
    const baseBytes = Buffer.byteLength(JSON.stringify(basePayload));
    const paddingLength = Math.max(0, maxBytes - baseBytes - 64);
    const requestBody = JSON.stringify({
      ...basePayload,
      padding: "x".repeat(paddingLength)
    });
    const requestBytes = Buffer.byteLength(requestBody);

    expect(requestBytes).toBeLessThanOrEqual(maxBytes);
    expect(requestBytes).toBeGreaterThan(maxBytes - 2048);

    const resolver: SecretResolver = {
      async resolveRefs(refs, timeoutMs, concurrency) {
        expect(refs.length).toBe(200);
        expect(timeoutMs).toBe(120000);
        expect(concurrency).toBe(10);

        const values = new Map<string, string>();
        for (const ref of refs) {
          values.set(ref, "secret");
        }
        return values;
      }
    };

    await runResolver({
      stdin: stdinFrom(requestBody),
      stdout: out,
      env: {
        ...createConfigEnv({
          defaultVault: "MainVault",
          maxIds: 999,
          maxStdinBytes: 9999999,
          timeoutMs: 999999,
          stdinTimeoutMs: 999999,
          concurrency: 999
        }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      resolver
    });

    const parsed = parseOutput(out.text);
    expect(parsed.protocolVersion).toBe(1);
    expect(Object.keys(parsed.values)).toHaveLength(200);
    expect(parsed.values["Service0/token"]).toBe("secret");
    expect(parsed.values["Service199/token"]).toBe("secret");
    expect(parsed.values["Service249/token"]).toBeUndefined();
  });

  it("ignores resolver values for refs that were not requested", async () => {
    const out = new CaptureWritable();

    const resolver: SecretResolver = {
      async resolveRefs(refs) {
        return new Map<string, string>([
          [refs[0], "secret-a"],
          ["op://MainVault/Other/token", "unexpected-secret"]
        ]);
      }
    };

    await runResolver({
      stdin: stdinFrom(JSON.stringify({ protocolVersion: 1, ids: ["ServiceA/token"] })),
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

  it("applies deterministic last-id wins behavior when ids map to same ref", async () => {
    const out = new CaptureWritable();

    const resolver: SecretResolver = {
      async resolveRefs(refs) {
        return new Map<string, string>([[refs[0], "shared-secret"]]);
      }
    };

    await runResolver({
      stdin: stdinFrom(
        JSON.stringify({
          protocolVersion: 1,
          ids: ["ServiceA/token", "op://MainVault/ServiceA/token"]
        })
      ),
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
        "op://MainVault/ServiceA/token": "shared-secret"
      }
    });
  });
});
