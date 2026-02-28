import { describe, expect, it } from "vitest";
import { mapIdToReference, sanitizeId, sanitizeIds } from "../src/sanitize.js";

describe("sanitize", () => {
  it("accepts valid ids", () => {
    expect(sanitizeId(" MyAPI/token ")).toBe("MyAPI/token");
  });

  it("rejects invalid ids", () => {
    expect(sanitizeId(123)).toBeNull();
    expect(sanitizeId("   ")).toBeNull();
    expect(sanitizeId("abc\nxyz")).toBeNull();
    expect(sanitizeId("abc\0xyz")).toBeNull();
    expect(sanitizeId("../abc")).toBeNull();
  });

  it("supports allowlist regex", () => {
    const allowlist = /^[A-Za-z0-9_\/-]+$/;
    expect(sanitizeId("ok/value", allowlist)).toBe("ok/value");
    expect(sanitizeId("bad value", allowlist)).toBeNull();
  });

  it("dedupes and limits ids", () => {
    const ids = sanitizeIds(["a", "a", "b", "c"], 2);
    expect(ids).toEqual(["a", "b"]);
  });

  it("maps ids to refs with passthrough", () => {
    expect(mapIdToReference("MyAPI/token", "MainVault")).toBe(
      "op://MainVault/MyAPI/token"
    );
    expect(mapIdToReference("op://Vault/item/field", "MainVault")).toBe(
      "op://Vault/item/field"
    );
  });
});
