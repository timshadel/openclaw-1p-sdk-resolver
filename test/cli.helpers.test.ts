import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  buildRowsForNoRequestedRefs,
  buildRowsForResolvedRefs,
  displayValue,
  toResolveJsonPayload,
  getLastFlag,
  getStringFlag,
  hasFlag,
  parseFlags,
  renderResolveTable,
  renderAsciiTable,
  truncateCell,
  ensureRevealAllowed
} from "../src/cli.js";

describe("cli helpers", () => {
  it("parseFlags handles -- sentinel, non-flags, empty flag key, and key=value", () => {
    const parsed = parseFlags(["alpha", "--", "beta", "--json"]);
    expect(parsed.positionals).toEqual(["alpha", "beta", "--json"]);

    const parsed2 = parseFlags(["--=bad", "--flag=value", "--bool"]);
    expect(parsed2.flags.has("")).toBe(false);
    expect(getLastFlag(parsed2.flags, "flag")).toBe("value");
    expect(getLastFlag(parsed2.flags, "bool")).toBe("true");
  });

  it("hasFlag/getStringFlag handle truthy and missing values", () => {
    const parsed = parseFlags(["--json=true", "--write=1", "--dry=no", "--name", "MainVault", "--empty", " "]);
    expect(hasFlag(parsed.flags, "json")).toBe(true);
    expect(hasFlag(parsed.flags, "write")).toBe(true);
    expect(hasFlag(parsed.flags, "dry")).toBe(false);
    expect(getStringFlag(parsed.flags, "name")).toBe("MainVault");
    expect(getStringFlag(parsed.flags, "empty")).toBeUndefined();
    expect(getStringFlag(parsed.flags, "missing")).toBeUndefined();
  });

  it("truncateCell and displayValue handle edge paths", () => {
    expect(truncateCell("abcdef", 3)).toBe("abc");
    expect(truncateCell("abcdef", 5)).toBe("ab...");
    expect(displayValue(undefined)).toBe("-");
    expect(displayValue(null)).toBe("null");
    expect(displayValue(/abc/)).toBe("abc");
    expect(displayValue({ a: 1 })).toBe('{"a":1}');
  });

  it("renderAsciiTable respects maxWidth truncation", () => {
    const out = renderAsciiTable(
      [
        { header: "A", maxWidth: 4 },
        { header: "B", maxWidth: 4 }
      ],
      [["123456", "abcdef"]]
    );
    expect(out).toContain("| A");
    expect(out).toContain("1...");
    expect(out).toContain("a...");
  });

  it("ensureRevealAllowed returns false when stdout is not tty but stdin is tty", async () => {
    const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
    const stdout = new PassThrough() as PassThrough & { isTTY?: boolean };
    stdin.isTTY = true;
    stdout.isTTY = false;

    const allowed = await ensureRevealAllowed({
      reveal: true,
      yes: false,
      streams: { stdin, stdout, stderr: new PassThrough() }
    });

    expect(allowed).toBe(false);
  });

  it("ensureRevealAllowed returns confirm callback result when provided", async () => {
    const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
    const stdout = new PassThrough() as PassThrough & { isTTY?: boolean };
    stdin.isTTY = true;
    stdout.isTTY = true;

    const allowed = await ensureRevealAllowed({
      reveal: true,
      yes: false,
      confirm: async () => false,
      streams: { stdin, stdout, stderr: new PassThrough() }
    });
    expect(allowed).toBe(false);
  });

  it("ensureRevealAllowed prompts on tty streams and accepts yes", async () => {
    const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
    const stdout = new PassThrough() as PassThrough & { isTTY?: boolean };
    stdin.isTTY = true;
    stdout.isTTY = true;
    stdin.end("yes\n");

    const allowed = await ensureRevealAllowed({
      reveal: true,
      yes: false,
      streams: { stdin, stdout, stderr: new PassThrough() }
    });
    expect(allowed).toBe(true);
  });

  it("buildRowsForNoRequestedRefs maps filtered and missing outputs correctly", () => {
    const rows = buildRowsForNoRequestedRefs(["a", "b", "c"], new Map([["a", "policy-blocked"], ["b", "invalid-ref"]]));
    expect(rows).toEqual([
      { id: "a", status: "unresolved", output: "filtered", reason: "policy-blocked" },
      { id: "b", status: "unresolved", output: "filtered", reason: "invalid-ref" },
      { id: "c", status: "unresolved", output: "missing", reason: "sdk-unresolved" }
    ]);
  });

  it("buildRowsForResolvedRefs covers resolved, unresolved, and internal mapping miss", () => {
    const unresolvedReasons = new Map<string, string>([["blocked", "policy-blocked"]]);
    const rows = buildRowsForResolvedRefs({
      sanitizedIds: ["blocked", "ok", "missing", "orphan"],
      unresolvedReasons,
      requestedRefs: ["op://Main/Item/ok", "op://Main/Item/missing"],
      refToId: new Map([
        ["op://Main/Item/ok", "ok"],
        ["op://Main/Item/missing", "missing"]
      ]),
      resolved: new Map([["op://Main/Item/ok", "supersecret"]]),
      reveal: false
    });

    expect(rows.find((row) => row.id === "blocked")).toEqual({
      id: "blocked",
      status: "unresolved",
      output: "filtered",
      reason: "policy-blocked"
    });
    const okRow = rows.find((row) => row.id === "ok");
    expect(okRow?.status).toBe("resolved");
    expect(okRow?.output.includes("sha256=")).toBe(true);
    expect(rows.find((row) => row.id === "missing")).toEqual({
      id: "missing",
      status: "unresolved",
      output: "missing",
      reason: "sdk-unresolved"
    });
    expect(rows.find((row) => row.id === "orphan")).toEqual({
      id: "orphan",
      status: "unresolved",
      output: "filtered",
      reason: "internal-mapping-miss"
    });
  });

  it("toResolveJsonPayload and renderResolveTable include reason only when debug is enabled", () => {
    const rows = [
      { id: "a", status: "resolved", output: "out-a", reason: "resolved" },
      { id: "b", status: "unresolved", output: "out-b", reason: "policy-blocked" }
    ] as const;

    const debugPayload = toResolveJsonPayload(rows, { debug: true, reveal: false });
    expect(debugPayload.results[0].reason).toBe("resolved");
    const nonDebugPayload = toResolveJsonPayload(rows, { debug: false, reveal: false });
    expect(nonDebugPayload.results[0].reason).toBeUndefined();

    const debugTable = renderResolveTable(rows, true);
    expect(debugTable).toContain("Reason");
    const nonDebugTable = renderResolveTable(rows, false);
    expect(nonDebugTable).not.toContain("Reason");
  });
});
