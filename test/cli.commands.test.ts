import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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

  it("config init requires --default-vault when no existing config and writes with --force rules", async () => {
    const home = path.join(tmpdir(), `onep-cli-init-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const configPath = path.join(home, ".config", "openclaw-1p-sdk-resolver", "config.json");

    const dryRunStreams = createStreams();
    const dryRunCode = await runCli(["config", "init"], {
      env: { HOME: home },
      streams: dryRunStreams,
      runResolver: async () => undefined
    });
    expect(dryRunCode).toBe(2);
    expect(dryRunStreams.out.stderr).toContain("defaultVault is required");
    expect(existsSync(configPath)).toBe(false);

    const writeStreams = createStreams();
    const writeCode = await runCli(["config", "init", "--default-vault", "MainVault", "--write"], {
      env: { HOME: home },
      streams: writeStreams,
      runResolver: async () => undefined
    });
    expect(writeCode).toBe(0);
    expect(existsSync(configPath)).toBe(true);

    const failOverwriteStreams = createStreams();
    const failOverwriteCode = await runCli(["config", "init", "--default-vault", "MainVault", "--write"], {
      env: { HOME: home },
      streams: failOverwriteStreams,
      runResolver: async () => undefined
    });
    expect(failOverwriteCode).toBe(2);

    const forceOverwriteStreams = createStreams();
    const forceOverwriteCode = await runCli(
      ["config", "init", "--default-vault", "MainVault", "--write", "--force"],
      {
        env: { HOME: home },
        streams: forceOverwriteStreams,
        runResolver: async () => undefined
      }
    );

    expect(forceOverwriteCode).toBe(0);

    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(parsed.defaultVault).toBe("MainVault");
    expect(parsed.vaultPolicy).toBe("default_vault");
  });

  it("config init can reuse existing config defaultVault when flag is omitted", async () => {
    const home = createHomeWithConfig({ defaultVault: "ExistingVault", vaultPolicy: "default_vault" });
    const configPath = path.join(home, ".config", "openclaw-1p-sdk-resolver", "config.json");

    const dryRunStreams = createStreams();
    const dryRunCode = await runCli(["config", "init"], {
      env: { HOME: home },
      streams: dryRunStreams,
      runResolver: async () => undefined
    });
    expect(dryRunCode).toBe(0);
    expect(dryRunStreams.out.stdout).toContain("ExistingVault");

    const writeStreams = createStreams();
    const writeCode = await runCli(["config", "init", "--write", "--force"], {
      env: { HOME: home },
      streams: writeStreams,
      runResolver: async () => undefined
    });
    expect(writeCode).toBe(0);
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    expect(parsed.defaultVault).toBe("ExistingVault");
    expect(parsed.vaultPolicy).toBe("default_vault");
  });

  it("config path human output uses table format", async () => {
    const streams = createStreams();
    const code = await runCli(["config", "path"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams,
      runResolver: async () => undefined
    });

    expect(code).toBe(0);
    expect(streams.out.stdout).toContain("CONFIG PATH");
    expect(streams.out.stdout).toContain("| Field");
    expect(streams.out.stdout).toContain("| Path");
    expect(streams.out.stdout).toContain("| Exists");
    expect(streams.out.stdout).toContain("| Readable");
    expect(streams.out.stdout.includes("\t")).toBe(false);
  });

  it("config show human output uses effective configuration table", async () => {
    const streams = createStreams();
    const code = await runCli(["config", "show"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams,
      runResolver: async () => undefined
    });

    expect(code).toBe(0);
    expect(streams.out.stdout).toContain("EFFECTIVE CONFIGURATION");
    expect(streams.out.stdout).toContain("| Key");
    expect(streams.out.stdout).toContain("| Effective Value");
    expect(streams.out.stdout).toContain("| Source");
    expect(streams.out.stdout.includes("\t")).toBe(false);
  });

  it("openclaw snippet human output uses table format", async () => {
    const streams = createStreams();
    const code = await runCli(["openclaw", "snippet"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams,
      runResolver: async () => undefined
    });

    expect(code).toBe(0);
    expect(streams.out.stdout).toContain("OPENCLAW PROVIDER SNIPPET");
    expect(streams.out.stdout).toContain("| Field");
    expect(streams.out.stdout).toContain("| Command");
    expect(streams.out.stdout).toContain("/absolute/path/to/openclaw-1p-sdk-resolver");
    expect(streams.out.stdout.includes("\t")).toBe(false);
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

  it("resolve human output uses table format", async () => {
    const streams = createStreams();
    const resolver: SecretResolver = {
      resolveRefs: async (refs: string[]) => {
        const out = new Map<string, string>();
        for (const ref of refs) {
          out.set(ref, "secret-value");
        }
        return out;
      }
    };

    const code = await runCli(["resolve", "--id", "MyAPI/token"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "default" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      resolver,
      runResolver: async () => undefined
    });

    expect(code).toBe(0);
    expect(streams.out.stdout).toContain("RESOLVE RESULTS");
    expect(streams.out.stdout).toContain("| ID");
    expect(streams.out.stdout).toContain("| Status");
    expect(streams.out.stdout).toContain("| Output");
    expect(streams.out.stdout.includes("\t")).toBe(false);
  });

  it("resolve --debug --json includes sdk-unresolved reason without secrets", async () => {
    const streams = createStreams();
    const resolver: SecretResolver = {
      resolveRefs: async () => new Map<string, string>()
    };

    const code = await runCli(["resolve", "--id", "MyAPI/token", "--json", "--debug"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "default" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      resolver,
      runResolver: async () => undefined
    });

    expect(code).toBe(1);
    const parsed = JSON.parse(streams.out.stdout) as {
      debug: boolean;
      reveal: boolean;
      results: Array<{ status: string; output: string; reason?: string }>;
    };
    expect(parsed.debug).toBe(true);
    expect(parsed.reveal).toBe(false);
    expect(parsed.results[0].status).toBe("unresolved");
    expect(parsed.results[0].output).toBe("missing");
    expect(parsed.results[0].reason).toBe("sdk-unresolved");
  });

  it("resolve --debug reports policy-blocked reason", async () => {
    const streams = createStreams();
    const code = await runCli(
      ["resolve", "--id", "op://OtherVault/Item/field", "--json", "--debug"],
      {
        env: {
          HOME: createHomeWithConfig({ defaultVault: "MainVault", vaultPolicy: "default_vault" }),
          OP_SERVICE_ACCOUNT_TOKEN: "token"
        },
        streams,
        resolver: {
          resolveRefs: async () => new Map<string, string>()
        },
        runResolver: async () => undefined
      }
    );

    expect(code).toBe(1);
    const parsed = JSON.parse(streams.out.stdout) as {
      results: Array<{ output: string; reason?: string }>;
    };
    expect(parsed.results[0].output).toBe("filtered");
    expect(parsed.results[0].reason).toBe("policy-blocked");
  });

  it("config init --write refuses to overwrite symlink paths", async () => {
    const home = path.join(tmpdir(), `onep-cli-symlink-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const configDir = path.join(home, ".config", "openclaw-1p-sdk-resolver");
    mkdirSync(configDir, { recursive: true });

    const realTargetPath = path.join(home, "real-target.json");
    writeFileSync(realTargetPath, "{\"do_not\":\"overwrite\"}\n", "utf8");

    const configPath = path.join(configDir, "config.json");
    symlinkSync(realTargetPath, configPath);

    const streams = createStreams();
    const code = await runCli(["config", "init", "--default-vault", "MainVault", "--write", "--force"], {
      env: { HOME: home },
      streams,
      runResolver: async () => undefined
    });

    expect(code).toBe(2);
    expect(streams.out.stderr).toContain("Refusing to write config to a symbolic link path.");
    expect(readFileSync(realTargetPath, "utf8")).toContain("\"do_not\":\"overwrite\"");
  });
});
