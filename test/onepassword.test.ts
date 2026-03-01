import { spawn } from "node:child_process";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createOnePasswordResolver, isValidSecretReference } from "../src/onepassword.js";

vi.mock("@1password/sdk", async () => {
  const actual = await vi.importActual<typeof import("@1password/sdk")>("@1password/sdk");
  return {
    ...actual,
    createClient: vi.fn()
  };
});

import { createClient } from "@1password/sdk";

const createClientMock = vi.mocked(createClient);

describe("onepassword adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("propagates createClient failure", async () => {
    createClientMock.mockRejectedValue(new Error("auth-failed"));

    await expect(
      createOnePasswordResolver({
        auth: "token",
        clientName: "test",
        clientVersion: "1.0.0"
      })
    ).rejects.toThrow("auth-failed");
  });

  it("throws when client has no secrets api", async () => {
    createClientMock.mockResolvedValue({} as unknown as Awaited<ReturnType<typeof createClient>>);

    await expect(
      createOnePasswordResolver({
        auth: "token",
        clientName: "test",
        clientVersion: "1.0.0"
      })
    ).rejects.toThrow("1password-secrets-api-missing");
  });

  it("returns empty map for empty input refs", async () => {
    const resolve = vi.fn();
    createClientMock.mockResolvedValue({
      secrets: { resolve }
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const adapter = await createOnePasswordResolver({
      auth: "token",
      clientName: "test",
      clientVersion: "1.0.0"
    });
    const result = await adapter.resolveRefs([], 1000, 4);

    expect(result.size).toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("handles resolveAll map result", async () => {
    createClientMock.mockResolvedValue({
      secrets: {
        resolveAll: vi.fn(async () => new Map([["op://Main/item/field", "value-a"]]))
      }
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const adapter = await createOnePasswordResolver({
      auth: "token",
      clientName: "test",
      clientVersion: "1.0.0"
    });
    const refs = ["op://Main/item/field"];
    const result = await adapter.resolveRefs(refs, 1000, 4);

    expect(result.get(refs[0])).toBe("value-a");
  });

  it("handles resolveAll array and object result shapes", async () => {
    const resolveAll = vi
      .fn(async () => ["value-a", "value-b"])
      .mockImplementationOnce(async () => ["value-a", "value-b"])
      .mockImplementationOnce(async () => ({
        "op://Main/item/a": "value-a",
        "op://Main/item/b": "value-b"
      }));
    createClientMock.mockResolvedValue({
      secrets: { resolveAll }
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const adapter = await createOnePasswordResolver({
      auth: "token",
      clientName: "test",
      clientVersion: "1.0.0"
    });
    const refs = ["op://Main/item/a", "op://Main/item/b"];

    const arrResult = await adapter.resolveRefs(refs, 1000, 4);
    const objResult = await adapter.resolveRefs(refs, 1000, 4);

    expect(arrResult.get(refs[0])).toBe("value-a");
    expect(arrResult.get(refs[1])).toBe("value-b");
    expect(objResult.get(refs[0])).toBe("value-a");
    expect(objResult.get(refs[1])).toBe("value-b");
  });

  it("falls back to per-ref resolve when resolveAll throws", async () => {
    const resolve = vi.fn(async (ref: string) => `v:${ref}`);
    createClientMock.mockResolvedValue({
      secrets: {
        resolveAll: vi.fn(async () => {
          throw new Error("bulk-failed");
        }),
        resolve
      }
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const adapter = await createOnePasswordResolver({
      auth: "token",
      clientName: "test",
      clientVersion: "1.0.0"
    });
    const refs = ["op://Main/item/a", "op://Main/item/b"];
    const result = await adapter.resolveRefs(refs, 1000, 2);

    expect(result.get(refs[0])).toBe(`v:${refs[0]}`);
    expect(result.get(refs[1])).toBe(`v:${refs[1]}`);
  });

  it("returns empty when neither resolveAll nor resolve exists", async () => {
    createClientMock.mockResolvedValue({
      secrets: {}
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const adapter = await createOnePasswordResolver({
      auth: "token",
      clientName: "test",
      clientVersion: "1.0.0"
    });
    const result = await adapter.resolveRefs(["op://Main/item/field"], 1000, 2);

    expect(result.size).toBe(0);
  });

  it("omits per-ref failures while returning successful refs", async () => {
    const resolve = vi.fn(async (ref: string) => {
      if (ref.endsWith("/bad")) {
        throw new Error("denied");
      }
      return `ok:${ref}`;
    });
    createClientMock.mockResolvedValue({
      secrets: { resolve }
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const adapter = await createOnePasswordResolver({
      auth: "token",
      clientName: "test",
      clientVersion: "1.0.0"
    });
    const refs = ["op://Main/item/good", "op://Main/item/bad"];
    const result = await adapter.resolveRefs(refs, 1000, 2);

    expect(result.get(refs[0])).toBe(`ok:${refs[0]}`);
    expect(result.has(refs[1])).toBe(false);
  });

  it("respects configured concurrency during per-ref resolve", async () => {
    let inFlight = 0;
    let peakInFlight = 0;
    const resolve = vi.fn(async (ref: string) => {
      inFlight += 1;
      peakInFlight = Math.max(peakInFlight, inFlight);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 15));
      inFlight -= 1;
      return `ok:${ref}`;
    });
    createClientMock.mockResolvedValue({
      secrets: { resolve }
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const adapter = await createOnePasswordResolver({
      auth: "token",
      clientName: "test",
      clientVersion: "1.0.0"
    });
    const refs = Array.from({ length: 8 }, (_, i) => `op://Main/item/${i}`);
    const result = await adapter.resolveRefs(refs, 1000, 3);

    expect(result.size).toBe(refs.length);
    expect(peakInFlight).toBeLessThanOrEqual(3);
  });

  it("handles subprocess-backed per-ref failures without throwing", async () => {
    createClientMock.mockResolvedValue({
      secrets: {
        resolve: async () =>
          await new Promise<string>((_resolve, reject) => {
            const child = spawn(process.execPath, ["-e", "process.exit(9)"], { stdio: "ignore" });
            child.once("error", reject);
            child.once("close", () => reject(new Error("child-failed")));
          })
      }
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const adapter = await createOnePasswordResolver({
      auth: "token",
      clientName: "test",
      clientVersion: "1.0.0"
    });
    const result = await adapter.resolveRefs(["op://Main/item/field"], 1000, 1);

    expect(result.size).toBe(0);
  });

  it("handles hung subprocess in resolveAll by falling back to resolve", async () => {
    const resolve = vi.fn(async (ref: string) => `ok:${ref}`);
    createClientMock.mockResolvedValue({
      secrets: {
        resolveAll: async () =>
          await new Promise<unknown>((_resolve, reject) => {
            const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], {
              stdio: "ignore"
            });
            setTimeout(() => {
              child.kill("SIGKILL");
              reject(new Error("subprocess-stuck"));
            }, 20);
          }),
        resolve
      }
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const adapter = await createOnePasswordResolver({
      auth: "token",
      clientName: "test",
      clientVersion: "1.0.0"
    });
    const refs = ["op://Main/item/a", "op://Main/item/b"];
    const result = await adapter.resolveRefs(refs, 1000, 2);

    expect(result.get(refs[0])).toBe(`ok:${refs[0]}`);
    expect(result.get(refs[1])).toBe(`ok:${refs[1]}`);
  });

  it("returns empty when per-ref resolve exceeds timeout", async () => {
    createClientMock.mockResolvedValue({
      secrets: {
        resolve: async () =>
          await new Promise<string>(() => {
            // Intentionally never resolves.
          })
      }
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const adapter = await createOnePasswordResolver({
      auth: "token",
      clientName: "test",
      clientVersion: "1.0.0"
    });
    const result = await adapter.resolveRefs(["op://Main/item/field"], 25, 1);

    expect(result.size).toBe(0);
  });

  it("rejects odd url syntax that is invalid for 1password secret references", () => {
    expect(isValidSecretReference("op://MainVault/item/field")).toBe(true);
    expect(isValidSecretReference("op://MainVault/item/field?attribute=otp")).toBe(true);

    expect(isValidSecretReference("op://MainVault/item/field?x=1")).toBe(false);
    expect(isValidSecretReference("op://MainVault/item/field#frag")).toBe(false);
    expect(isValidSecretReference("op://MainVault/http://evil/field")).toBe(false);
    expect(isValidSecretReference("http://example.com")).toBe(false);
    expect(isValidSecretReference("op://MainVault/item")).toBe(false);
  });
});
