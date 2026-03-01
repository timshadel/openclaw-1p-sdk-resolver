import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { canReadPath, ensureRevealAllowed, runCli, writeConfigFileSafely } from "../src/cli.js";
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

  it("doctor returns misconfigured when token is missing and runtime-error when sdk init fails", async () => {
    const missingTokenStreams = createStreams();
    const missingTokenCode = await runCli(["doctor", "--json"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault" })
      },
      streams: missingTokenStreams,
      runResolver: async () => undefined
    });
    expect(missingTokenCode).toBe(2);

    const sdkFailStreams = createStreams();
    const sdkFailCode = await runCli(["doctor", "--json"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams: sdkFailStreams,
      runResolver: async () => undefined,
      createResolver: async () => {
        throw new Error("sdk-down");
      }
    });
    expect(sdkFailCode).toBe(3);
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

  it("doctor human output renders validation issues rows when config has errors", async () => {
    const home = createHomeWithConfig({
      defaultVault: "MainVault",
      vaultPolicy: "not-a-policy"
    });
    const streams = createStreams();

    const code = await runCli(["doctor"], {
      env: {
        HOME: home,
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      runResolver: async () => undefined
    });

    expect(code).toBe(2);
    expect(streams.out.stdout).toContain("VALIDATION ISSUES");
    expect(streams.out.stdout).toContain("invalid_vault_policy");
    expect(streams.out.stdout).toContain("vaultPolicy");
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

  it("config init supports --json output in dry-run and write modes", async () => {
    const home = path.join(tmpdir(), `onep-cli-json-init-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const dryRunStreams = createStreams();
    const dryRunCode = await runCli(["config", "init", "--default-vault", "JsonVault", "--json"], {
      env: { HOME: home },
      streams: dryRunStreams,
      runResolver: async () => undefined
    });
    expect(dryRunCode).toBe(0);
    const dryRunJson = JSON.parse(dryRunStreams.out.stdout) as {
      wrote: boolean;
      dryRun: boolean;
      path: string;
      wouldWrite: string;
    };
    expect(dryRunJson.wrote).toBe(false);
    expect(dryRunJson.dryRun).toBe(true);
    expect(dryRunJson.path).toBeTruthy();
    expect(dryRunJson.wouldWrite).toContain("\"defaultVault\": \"JsonVault\"");

    const writeStreams = createStreams();
    const writeCode = await runCli(["config", "init", "--default-vault", "JsonVault", "--json", "--write"], {
      env: { HOME: home },
      streams: writeStreams,
      runResolver: async () => undefined
    });
    expect(writeCode).toBe(0);
    const writeJson = JSON.parse(writeStreams.out.stdout) as {
      wrote: boolean;
      dryRun: boolean;
      overwritten: boolean;
    };
    expect(writeJson.wrote).toBe(true);
    expect(writeJson.dryRun).toBe(false);
    expect(writeJson.overwritten).toBe(false);
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

  it("config path json output includes source metadata", async () => {
    const streams = createStreams();
    const code = await runCli(["config", "path", "--json"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams,
      runResolver: async () => undefined
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(streams.out.stdout) as { source: string; exists: boolean; readable: boolean };
    expect(parsed.source).toBeTruthy();
    expect(typeof parsed.exists).toBe("boolean");
    expect(typeof parsed.readable).toBe("boolean");
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

  it("config show --verbose includes path and validation sections in human output", async () => {
    const streams = createStreams();
    const code = await runCli(["config", "show", "--verbose"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault", vaultPolicy: "bad-policy" }) },
      streams,
      runResolver: async () => undefined
    });

    expect(code).toBe(2);
    expect(streams.out.stdout).toContain("CONFIG PATH");
    expect(streams.out.stdout).toContain("VALIDATION ISSUES");
    expect(streams.out.stdout).toContain("invalid_vault_policy");
  });

  it("config show supports defaults and current-file modes in json and table output", async () => {
    const home = createHomeWithConfig({ defaultVault: "MainVault", vaultPolicy: "default_vault" });

    const defaultsJsonStreams = createStreams();
    const defaultsJsonCode = await runCli(["config", "show", "--defaults", "--json"], {
      env: { HOME: home },
      streams: defaultsJsonStreams,
      runResolver: async () => undefined
    });
    expect(defaultsJsonCode).toBe(0);
    const defaultsJson = JSON.parse(defaultsJsonStreams.out.stdout) as Record<string, unknown>;
    expect(defaultsJson.defaultVault).toBe("default");

    const defaultsHumanStreams = createStreams();
    const defaultsHumanCode = await runCli(["config", "show", "--defaults"], {
      env: { HOME: home },
      streams: defaultsHumanStreams,
      runResolver: async () => undefined
    });
    expect(defaultsHumanCode).toBe(0);
    expect(defaultsHumanStreams.out.stdout).toContain("DEFAULT CONFIGURATION");

    const currentFileJsonStreams = createStreams();
    const currentFileJsonCode = await runCli(["config", "show", "--current-file", "--json"], {
      env: { HOME: home },
      streams: currentFileJsonStreams,
      runResolver: async () => undefined
    });
    expect(currentFileJsonCode).toBe(0);
    const currentFileJson = JSON.parse(currentFileJsonStreams.out.stdout) as Record<string, unknown>;
    expect(currentFileJson.defaultVault).toBe("MainVault");

    const currentFileHumanStreams = createStreams();
    const currentFileHumanCode = await runCli(["config", "show", "--current-file"], {
      env: { HOME: home },
      streams: currentFileHumanStreams,
      runResolver: async () => undefined
    });
    expect(currentFileHumanCode).toBe(0);
    expect(currentFileHumanStreams.out.stdout).toContain("CURRENT CONFIG FILE");
  });

  it("config show --json --verbose includes provenance/path/issues", async () => {
    const home = createHomeWithConfig({
      defaultVault: "MainVault",
      vaultPolicy: "default_vault",
      maxIds: 999
    });
    const streams = createStreams();
    const code = await runCli(["config", "show", "--json", "--verbose"], {
      env: { HOME: home },
      streams,
      runResolver: async () => undefined
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(streams.out.stdout) as {
      config: Record<string, unknown>;
      provenance: Record<string, unknown>;
      path: { path?: string };
      issues: unknown[];
    };
    expect(parsed.config.defaultVault).toBe("MainVault");
    expect(parsed.provenance.defaultVault).toBeDefined();
    expect(parsed.path.path).toBeTruthy();
    expect(Array.isArray(parsed.issues)).toBe(true);
  });

  it("config show --current-file handles missing and malformed files", async () => {
    const missingHome = path.join(tmpdir(), `onep-cli-missing-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const missingStreams = createStreams();
    const missingCode = await runCli(["config", "show", "--current-file"], {
      env: { HOME: missingHome },
      streams: missingStreams,
      runResolver: async () => undefined
    });
    expect(missingCode).toBe(2);
    expect(missingStreams.out.stderr).toContain("No config file exists");

    const malformedHome = path.join(
      tmpdir(),
      `onep-cli-malformed-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    const malformedDir = path.join(malformedHome, ".config", "openclaw-1p-sdk-resolver");
    mkdirSync(malformedDir, { recursive: true });
    writeFileSync(path.join(malformedDir, "config.json"), "{not-json", "utf8");

    const malformedStreams = createStreams();
    const malformedCode = await runCli(["config", "show", "--current-file"], {
      env: { HOME: malformedHome },
      streams: malformedStreams,
      runResolver: async () => undefined
    });
    expect(malformedCode).toBe(2);
    expect(malformedStreams.out.stderr).toContain("Config file is not valid JSON");
  });

  it("config show --current-file returns unreadable error when file permissions deny reads", async () => {
    const home = path.join(tmpdir(), `onep-cli-unreadable-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const configDir = path.join(home, ".config", "openclaw-1p-sdk-resolver");
    mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, "config.json");
    writeFileSync(configPath, "{\"defaultVault\":\"MainVault\"}\n", "utf8");
    chmodSync(configPath, 0o000);

    const streams = createStreams();
    try {
      const code = await runCli(["config", "show", "--current-file"], {
        env: { HOME: home },
        streams,
        runResolver: async () => undefined
      });
      expect(code).toBe(2);
      expect(streams.out.stderr).toContain("Resolved config file is not readable.");
    } finally {
      chmodSync(configPath, 0o600);
    }
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

  it("openclaw snippet supports json output", async () => {
    const streams = createStreams();
    const code = await runCli(["openclaw", "snippet", "--json"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams,
      runResolver: async () => undefined
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(streams.out.stdout) as {
      providers: Array<{ kind: string; config: { jsonOnly: boolean; passEnv: string[] } }>;
    };
    expect(parsed.providers[0].kind).toBe("exec");
    expect(parsed.providers[0].config.jsonOnly).toBe(true);
    expect(parsed.providers[0].config.passEnv).toContain("OP_SERVICE_ACCOUNT_TOKEN");
  });

  it("openclaw audit scan uses openclaw env precedence and emits safe json findings", async () => {
    const root = path.join(tmpdir(), `onep-cli-audit-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const stateDir = path.join(root, "state");
    const homeDir = path.join(root, "home");
    mkdirSync(stateDir, { recursive: true });
    mkdirSync(path.join(homeDir, ".openclaw"), { recursive: true });
    writeFileSync(
      path.join(stateDir, "openclaw.json"),
      JSON.stringify({
        secrets: ["op://MainVault/Item/token"]
      }),
      "utf8"
    );
    writeFileSync(path.join(root, ".env"), "API_TOKEN=supersecretvalue123456\n", "utf8");

    const streams = createStreams();
    const code = await runCli(["openclaw", "audit", "scan", "--json", "--repo", root], {
      env: {
        OPENCLAW_STATE_DIR: stateDir,
        HOME: homeDir
      },
      streams,
      runResolver: async () => undefined
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(streams.out.stdout) as {
      configPath: { source: string };
      summary: { referencesFound: number; candidateSecrets: number };
      findings: Array<{ type: string; fingerprint: string }>;
    };
    expect(parsed.configPath.source).toBe("OPENCLAW_STATE_DIR");
    expect(parsed.summary.referencesFound).toBe(1);
    expect(parsed.summary.candidateSecrets).toBeGreaterThan(0);
    expect(parsed.findings[0].fingerprint.includes("supersecretvalue123456")).toBe(false);
  });

  it("openclaw audit suggest reports recommendations in human output", async () => {
    const root = path.join(tmpdir(), `onep-cli-audit-suggest-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, "openclaw.json"), "{\"providers\":[]}\n", "utf8");

    const streams = createStreams();
    const code = await runCli(["openclaw", "audit", "suggest", "--path", path.join(root, "openclaw.json")], {
      env: {},
      streams,
      runResolver: async () => undefined
    });
    expect(code).toBe(0);
    expect(streams.out.stdout).toContain("OPENCLAW AUDIT");
    expect(streams.out.stdout).toContain("SUGGESTIONS");
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

  it("resolve supports --stdin ids and handles resolver runtime failure", async () => {
    const stdin = new PassThrough();
    stdin.end("MyAPI/token\n");
    const stdinStreams = createStreams(stdin);
    const stdinCode = await runCli(["resolve", "--stdin", "--json"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "default" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams: stdinStreams,
      resolver: {
        resolveRefs: async (refs: string[]) => new Map([[refs[0], "secret-from-stdin"]])
      },
      runResolver: async () => undefined
    });
    expect(stdinCode).toBe(0);

    const runtimeFailStreams = createStreams();
    const runtimeFailCode = await runCli(["resolve", "--id", "MyAPI/token"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "default" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams: runtimeFailStreams,
      resolver: {
        resolveRefs: async () => {
          throw new Error("boom");
        }
      },
      runResolver: async () => undefined
    });
    expect(runtimeFailCode).toBe(3);
    expect(runtimeFailStreams.out.stderr).toContain("Resolver runtime failed.");
  });

  it("resolve returns code 2 for invalid config and missing token", async () => {
    const invalidConfigStreams = createStreams();
    const invalidConfigCode = await runCli(["resolve", "--id", "MyAPI/token"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault", vaultPolicy: "bad-policy" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams: invalidConfigStreams,
      runResolver: async () => undefined
    });
    expect(invalidConfigCode).toBe(2);
    expect(invalidConfigStreams.out.stderr).toContain("Configuration is invalid");

    const missingTokenStreams = createStreams();
    const missingTokenCode = await runCli(["resolve", "--id", "MyAPI/token"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: missingTokenStreams,
      runResolver: async () => undefined
    });
    expect(missingTokenCode).toBe(2);
    expect(missingTokenStreams.out.stderr).toContain("OP_SERVICE_ACCOUNT_TOKEN is required");
  });

  it("resolve prompt path accepts tty confirmation for reveal mode", async () => {
    const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
    const stdout = new PassThrough() as PassThrough & { isTTY?: boolean };
    const stderr = new PassThrough() as PassThrough & { isTTY?: boolean };
    stdin.isTTY = true;
    stdout.isTTY = true;
    stdin.end("yes\n");
    let out = "";
    let err = "";
    stdout.on("data", (chunk: Buffer | string) => {
      out += chunk.toString();
    });
    stderr.on("data", (chunk: Buffer | string) => {
      err += chunk.toString();
    });

    const code = await runCli(["resolve", "--id", "MyAPI/token", "--reveal"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "default" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams: { stdin, stdout, stderr },
      resolver: {
        resolveRefs: async (refs: string[]) => new Map([[refs[0], "revealed-from-prompt"]])
      },
      runResolver: async () => undefined
    });

    expect(code).toBe(0);
    expect(out).toContain("revealed-from-prompt");
    expect(err).toBe("");
  });

  it("resolve returns code 1 when no valid ids remain after sanitization", async () => {
    const streams = createStreams();
    const code = await runCli(["resolve", "--id", "bad\nid"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "default" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      runResolver: async () => undefined
    });
    expect(code).toBe(1);
    expect(streams.out.stderr).toContain("No valid ids to resolve.");
  });

  it("resolve non-json output shows filtered rows and debug reasons when refs are blocked", async () => {
    const streams = createStreams();
    const code = await runCli(["resolve", "--id", "op://OtherVault/Item/field", "--debug"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault", vaultPolicy: "default_vault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      runResolver: async () => undefined
    });
    expect(code).toBe(1);
    expect(streams.out.stdout).toContain("RESOLVE RESULTS");
    expect(streams.out.stdout).toContain("policy-blocked");
    expect(streams.out.stdout).toContain("filtered");
  });

  it("resolve uses createResolver when resolver instance is not provided", async () => {
    const streams = createStreams();
    const code = await runCli(["resolve", "--id", "MyAPI/token", "--json"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "default" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      createResolver: async () => ({
        resolveRefs: async (refs: string[]) => new Map([[refs[0], "from-factory"]])
      }),
      runResolver: async () => undefined
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(streams.out.stdout) as {
      results: Array<{ status: string; output: string }>;
    };
    expect(parsed.results[0].status).toBe("resolved");
    expect(parsed.results[0].output).toContain("sha256=");
  });

  it("resolve non-json debug output includes reason column for mixed resolved and filtered rows", async () => {
    const streams = createStreams();
    const code = await runCli(["resolve", "--id", "MyAPI/token", "--id", "op://OtherVault/Item/field", "--debug"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "default", vaultPolicy: "default_vault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      resolver: {
        resolveRefs: async (refs: string[]) => new Map([[refs[0], "secret-value"]])
      },
      runResolver: async () => undefined
    });
    expect(code).toBe(1);
    expect(streams.out.stdout).toContain("| Reason");
    expect(streams.out.stdout).toContain("resolved");
    expect(streams.out.stdout).toContain("policy-blocked");
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

  it("config init fails when config path cannot be resolved", async () => {
    const streams = createStreams();
    const code = await runCli(["config", "init", "--default-vault", "MainVault"], {
      env: {},
      streams,
      runResolver: async () => undefined
    });
    expect(code).toBe(2);
    expect(streams.out.stderr).toContain("Unable to resolve config path.");
  });

  it("returns code 2 for unknown commands and subcommands", async () => {
    const unknownCommandStreams = createStreams();
    const unknownCommandCode = await runCli(["unknown-command"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: unknownCommandStreams,
      runResolver: async () => undefined
    });
    expect(unknownCommandCode).toBe(2);
    expect(unknownCommandStreams.out.stderr).toContain("Unknown command: unknown-command");

    const unknownConfigSubcommandStreams = createStreams();
    const unknownConfigSubcommandCode = await runCli(["config", "bad-subcommand"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: unknownConfigSubcommandStreams,
      runResolver: async () => undefined
    });
    expect(unknownConfigSubcommandCode).toBe(2);
    expect(unknownConfigSubcommandStreams.out.stderr).toContain("Unknown config subcommand");

    const unknownOpenclawSubcommandStreams = createStreams();
    const unknownOpenclawSubcommandCode = await runCli(["openclaw", "bad-subcommand"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: unknownOpenclawSubcommandStreams,
      runResolver: async () => undefined
    });
    expect(unknownOpenclawSubcommandCode).toBe(2);
    expect(unknownOpenclawSubcommandStreams.out.stderr).toContain("Unknown openclaw subcommand");
  });

  it("routes to resolver mode when invoked with no command arguments", async () => {
    const streams = createStreams();
    let called = false;
    const code = await runCli([], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams,
      runResolver: async () => {
        called = true;
      }
    });
    expect(code).toBe(0);
    expect(called).toBe(true);
  });

  it("ensureRevealAllowed handles all gating paths", async () => {
    const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
    const stdout = new PassThrough() as PassThrough & { isTTY?: boolean };
    stdin.isTTY = false;
    stdout.isTTY = false;

    expect(
      await ensureRevealAllowed({
        reveal: false,
        yes: false,
        streams: { stdin, stdout, stderr: new PassThrough() }
      })
    ).toBe(true);

    expect(
      await ensureRevealAllowed({
        reveal: true,
        yes: true,
        streams: { stdin, stdout, stderr: new PassThrough() }
      })
    ).toBe(true);

    expect(
      await ensureRevealAllowed({
        reveal: true,
        yes: false,
        confirm: async () => true,
        streams: { stdin, stdout, stderr: new PassThrough() }
      })
    ).toBe(true);

    expect(
      await ensureRevealAllowed({
        reveal: true,
        yes: false,
        streams: { stdin, stdout, stderr: new PassThrough() }
      })
    ).toBe(false);
  });

  it("canReadPath returns true for readable path and false for missing path", () => {
    const home = createHomeWithConfig({ defaultVault: "MainVault" });
    const existingPath = path.join(home, ".config", "openclaw-1p-sdk-resolver", "config.json");
    const missingPath = path.join(home, ".config", "openclaw-1p-sdk-resolver", "does-not-exist.json");
    expect(canReadPath(existingPath)).toBe(true);
    expect(canReadPath(missingPath)).toBe(false);
  });

  it("writeConfigFileSafely returns explicit messages for ENOTSUP and generic errors", () => {
    const eloopResult = writeConfigFileSafely({
      filePath: "/tmp/ignored",
      body: "{}",
      overwrite: false,
      fsOps: {
        openSync: (() => {
          const error = new Error("symlink") as NodeJS.ErrnoException;
          error.code = "ELOOP";
          throw error;
        }) as unknown as typeof import("node:fs").openSync
      }
    });
    expect(eloopResult.ok).toBe(false);
    if (!eloopResult.ok) {
      expect(eloopResult.message).toContain("symbolic link");
    }

    const eexistResult = writeConfigFileSafely({
      filePath: "/tmp/ignored",
      body: "{}",
      overwrite: false,
      fsOps: {
        openSync: (() => {
          const error = new Error("exists") as NodeJS.ErrnoException;
          error.code = "EEXIST";
          throw error;
        }) as unknown as typeof import("node:fs").openSync
      }
    });
    expect(eexistResult.ok).toBe(false);
    if (!eexistResult.ok) {
      expect(eexistResult.message).toContain("--force");
    }

    const einvalResult = writeConfigFileSafely({
      filePath: "/tmp/ignored",
      body: "{}",
      overwrite: false,
      fsOps: {
        openSync: (() => {
          const error = new Error("invalid") as NodeJS.ErrnoException;
          error.code = "EINVAL";
          throw error;
        }) as unknown as typeof import("node:fs").openSync
      }
    });
    expect(einvalResult.ok).toBe(false);
    if (!einvalResult.ok) {
      expect(einvalResult.message).toContain("not supported");
    }

    const enotsupResult = writeConfigFileSafely({
      filePath: "/tmp/ignored",
      body: "{}",
      overwrite: false,
      fsOps: {
        openSync: (() => {
          const error = new Error("unsupported") as NodeJS.ErrnoException;
          error.code = "ENOTSUP";
          throw error;
        }) as unknown as typeof import("node:fs").openSync
      }
    });
    expect(enotsupResult.ok).toBe(false);
    if (!enotsupResult.ok) {
      expect(enotsupResult.message).toContain("not supported");
    }

    const genericResult = writeConfigFileSafely({
      filePath: "/tmp/ignored",
      body: "{}",
      overwrite: false,
      fsOps: {
        openSync: (() => {
          const error = new Error("failed") as NodeJS.ErrnoException;
          error.code = "EIO";
          throw error;
        }) as unknown as typeof import("node:fs").openSync
      }
    });
    expect(genericResult.ok).toBe(false);
    if (!genericResult.ok) {
      expect(genericResult.message).toBe("Unable to write config file safely.");
    }

    const closeFailureResult = writeConfigFileSafely({
      filePath: "/tmp/ignored",
      body: "{}",
      overwrite: false,
      fsOps: {
        openSync: (() => 123) as unknown as typeof import("node:fs").openSync,
        writeFileSync: (() => undefined) as unknown as typeof import("node:fs").writeFileSync,
        closeSync: (() => {
          throw new Error("close-failed");
        }) as unknown as typeof import("node:fs").closeSync
      }
    });
    expect(closeFailureResult.ok).toBe(true);
  });
});
