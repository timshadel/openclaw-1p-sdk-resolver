import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

type CliResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

function runCli(input: string, env: NodeJS.ProcessEnv = {}): Promise<CliResult> {
  const cliPath = path.join(process.cwd(), "src", "resolver.ts");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", cliPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env
      },
      stdio: "pipe"
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

describe("cli process", () => {
  it("exits successfully and returns valid json on invalid input", async () => {
    const result = await runCli("not json");

    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(() => JSON.parse(result.stdout.trim())).not.toThrow();
    expect(result.stderr).toBe("");
  });

  it("exits successfully with missing token and does not leak input to stderr", async () => {
    const request = JSON.stringify({ protocolVersion: 1, ids: ["MyAPI/token"] });
    const result = await runCli(request, { OP_SERVICE_ACCOUNT_TOKEN: "" });
    const parsed = JSON.parse(result.stdout.trim()) as {
      protocolVersion: number;
      values: Record<string, string>;
    };

    expect(result.code).toBe(0);
    expect(parsed).toEqual({ protocolVersion: 1, values: {} });
    expect(result.stderr).toBe("");
    expect(result.stderr.includes("MyAPI/token")).toBe(false);
  });
});
