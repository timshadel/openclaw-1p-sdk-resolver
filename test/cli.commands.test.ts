import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import type { SecretResolver } from "../src/onepassword.js";

type Captured = {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: NodeJS.ReadableStream;
  out: { stdout: string; stderr: string };
};

function createStreams(stdin: NodeJS.ReadableStream = Readable.from([])): Captured {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const out = { stdout: "", stderr: "" };
  stdout.on("data", (chunk: Buffer | string) => {
    out.stdout += chunk.toString();
  });
  stderr.on("data", (chunk: Buffer | string) => {
    out.stderr += chunk.toString();
  });
  return { stdin, stdout, stderr, out };
}

function createHomeWithConfig(body: Record<string, unknown>): string {
  const home = path.join(tmpdir(), `onep-cli-home-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const configDir = path.join(home, ".config", "openclaw-1p-sdk-resolver");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, "config.json"), JSON.stringify(body), "utf8");
  return home;
}

describe("command cli", () => {
  it("doctor --json includes provenance and does not expose token values", async () => {
    const streams = createStreams();
    const token = "op_secret_token_for_test";

    const code = await runCli(["doctor", "--json"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault" }),
        OP_SERVICE_ACCOUNT_TOKEN: token
      },
      streams,
      runResolver: async () => undefined,
      createResolver: async () => ({
        resolveRefs: async () => new Map<string, string>()
      })
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(streams.out.stdout) as {
      provenance: Record<string, unknown>;
      env: { opServiceAccountTokenPresent: boolean };
    };
    expect(parsed.provenance).toBeDefined();
    expect(parsed.env.opServiceAccountTokenPresent).toBe(true);
    expect(streams.out.stdout.includes(token)).toBe(false);
  });

  it("doctor human output uses aligned fields and ascii table columns", async () => {
    const streams = createStreams();

    const code = await runCli(["doctor"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      runResolver: async () => undefined,
      createResolver: async () => ({
        resolveRefs: async () => new Map<string, string>()
      })
    });

    expect(code).toBe(0);
    expect(streams.out.stdout).toContain("DOCTOR REPORT");
    expect(streams.out.stdout).toContain("CONFIGURATION STATUS");
    expect(streams.out.stdout).toContain("ENVIRONMENT STATUS");
    expect(streams.out.stdout).toContain("EFFECTIVE CONFIGURATION");
    expect(streams.out.stdout).toContain("VALIDATION SUMMARY");
    expect(streams.out.stdout).toContain("VALIDATION ISSUES");
    expect(streams.out.stdout).toContain("+");
    expect(streams.out.stdout).toContain("| Key");
    expect(streams.out.stdout).toContain("| Effective Value");
    expect(streams.out.stdout.includes("\t")).toBe(false);
    expect(streams.out.stdout).toContain("| Exists");
    expect(streams.out.stdout).toContain("| Readable");
    expect(streams.out.stdout.includes("Config path")).toBe(false);
    expect(streams.out.stdout).toContain("| allowedIdRegex");
    expect(streams.out.stdout).toContain("| -");
  });

  it("config init is dry-run by default and writes only with --write, respecting --force", async () => {
    const home = path.join(tmpdir(), `onep-cli-init-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const configPath = path.join(home, ".config", "openclaw-1p-sdk-resolver", "config.json");

    const dryRunStreams = createStreams();
    const dryRunCode = await runCli(["config", "init"], {
      env: { HOME: home },
      streams: dryRunStreams,
      runResolver: async () => undefined
    });
    expect(dryRunCode).toBe(0);
    expect(existsSync(configPath)).toBe(false);

    const writeStreams = createStreams();
    const writeCode = await runCli(["config", "init", "--write"], {
      env: { HOME: home },
      streams: writeStreams,
      runResolver: async () => undefined
    });
    expect(writeCode).toBe(0);
    expect(existsSync(configPath)).toBe(true);

    const failOverwriteStreams = createStreams();
    const failOverwriteCode = await runCli(["config", "init", "--write"], {
      env: { HOME: home },
      streams: failOverwriteStreams,
      runResolver: async () => undefined
    });
    expect(failOverwriteCode).toBe(2);

    const forceOverwriteStreams = createStreams();
    const forceOverwriteCode = await runCli(["config", "init", "--write", "--force"], {
      env: { HOME: home },
      streams: forceOverwriteStreams,
      runResolver: async () => undefined
    });
    expect(forceOverwriteCode).toBe(0);

    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(parsed.defaultVault).toBe("default");
    expect(parsed.vaultPolicy).toBe("default_vault");
  });

  it("resolve returns redacted values by default", async () => {
    const streams = createStreams();
    const resolver: SecretResolver = {
      resolveRefs: async (refs: string[]) => {
        const out = new Map<string, string>();
        for (const ref of refs) {
          out.set(ref, "supersecretvalue");
        }
        return out;
      }
    };

    const code = await runCli(["resolve", "--id", "MyAPI/token", "--json"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "default" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      resolver,
      runResolver: async () => undefined
    });

    expect(code).toBe(0);
    expect(streams.out.stdout.includes("supersecretvalue")).toBe(false);
    const parsed = JSON.parse(streams.out.stdout) as {
      reveal: boolean;
      results: Array<{ status: string; output: string }>;
    };
    expect(parsed.reveal).toBe(false);
    expect(parsed.results[0].status).toBe("resolved");
    expect(parsed.results[0].output.includes("sha256=")).toBe(true);
  });

  it("resolve --reveal requires confirmation unless --yes is provided", async () => {
    const resolver: SecretResolver = {
      resolveRefs: async (refs: string[]) => {
        const out = new Map<string, string>();
        for (const ref of refs) {
          out.set(ref, "revealed-secret");
        }
        return out;
      }
    };

    const noYesStreams = createStreams();
    const noYesCode = await runCli(["resolve", "--id", "MyAPI/token", "--json", "--reveal"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "default" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams: noYesStreams,
      resolver,
      runResolver: async () => undefined
    });

    expect(noYesCode).toBe(2);
    expect(noYesStreams.out.stdout.includes("revealed-secret")).toBe(false);

    const yesStreams = createStreams();
    const yesCode = await runCli(["resolve", "--id", "MyAPI/token", "--json", "--reveal", "--yes"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "default" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams: yesStreams,
      resolver,
      runResolver: async () => undefined
    });

    expect(yesCode).toBe(0);
    expect(yesStreams.out.stdout.includes("revealed-secret")).toBe(true);
  });
});
