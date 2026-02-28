import { describe, expect, it } from "vitest";
import { extractVaultFromReference, isVaultAllowed, mapIdToReference, sanitizeId, sanitizeIds } from "../src/sanitize.js";

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

  it("handles unicode and additional control characters predictably", () => {
    const allowlist = /^[A-Za-z0-9_\/-]+$/;
    expect(sanitizeId("服务/token")).toBe("服务/token");
    expect(sanitizeId("emoji/🔐")).toBe("emoji/🔐");
    expect(sanitizeId("tab\tchar")).toBe("tab\tchar");
    expect(sanitizeId("line\u2028sep")).toBe("line\u2028sep");

    expect(sanitizeId("服务/token", allowlist)).toBeNull();
    expect(sanitizeId("emoji/🔐", allowlist)).toBeNull();
    expect(sanitizeId("tab\tchar", allowlist)).toBeNull();
    expect(sanitizeId("line\u2028sep", allowlist)).toBeNull();
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

  it("extracts vault from full refs", () => {
    expect(extractVaultFromReference("op://MainVault/MyAPI/token")).toBe("MainVault");
    expect(extractVaultFromReference("not-a-ref")).toBeNull();
  });

  it("enforces vault policy", () => {
    expect(
      isVaultAllowed({
        vault: "MainVault",
        defaultVault: "MainVault",
        vaultPolicy: "default_vault",
        vaultWhitelist: []
      })
    ).toBe(true);

    expect(
      isVaultAllowed({
        vault: "OtherVault",
        defaultVault: "MainVault",
        vaultPolicy: "default_vault",
        vaultWhitelist: ["OtherVault"]
      })
    ).toBe(false);

    expect(
      isVaultAllowed({
        vault: "OtherVault",
        defaultVault: "MainVault",
        vaultPolicy: "default_vault+whitelist",
        vaultWhitelist: ["OtherVault"]
      })
    ).toBe(true);

    expect(
      isVaultAllowed({
        vault: "AnotherVault",
        defaultVault: "MainVault",
        vaultPolicy: "any",
        vaultWhitelist: []
      })
    ).toBe(true);
  });
});
