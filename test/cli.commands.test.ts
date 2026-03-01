import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { canReadPath, ensureRevealAllowed, runCli, writeConfigFileSafely } from "../src/cli.js";
import { EXIT_POLICY } from "../src/exit-policy.js";
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

    expect(code).toBe(EXIT_POLICY.OK);
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
    expect(missingTokenCode).toBe(EXIT_POLICY.ERROR);

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
    expect(sdkFailCode).toBe(EXIT_POLICY.RUNTIME);
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

    expect(code).toBe(EXIT_POLICY.OK);
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

    expect(code).toBe(EXIT_POLICY.ERROR);
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
    expect(dryRunCode).toBe(EXIT_POLICY.ERROR);
    expect(dryRunStreams.out.stderr).toContain("defaultVault is required");
    expect(existsSync(configPath)).toBe(false);

    const writeStreams = createStreams();
    const writeCode = await runCli(["config", "init", "--default-vault", "MainVault", "--write"], {
      env: { HOME: home },
      streams: writeStreams,
      runResolver: async () => undefined
    });
    expect(writeCode).toBe(EXIT_POLICY.OK);
    expect(existsSync(configPath)).toBe(true);

    const failOverwriteStreams = createStreams();
    const failOverwriteCode = await runCli(["config", "init", "--default-vault", "MainVault", "--write"], {
      env: { HOME: home },
      streams: failOverwriteStreams,
      runResolver: async () => undefined
    });
    expect(failOverwriteCode).toBe(EXIT_POLICY.ERROR);

    const forceOverwriteStreams = createStreams();
    const forceOverwriteCode = await runCli(
      ["config", "init", "--default-vault", "MainVault", "--write", "--force"],
      {
        env: { HOME: home },
        streams: forceOverwriteStreams,
        runResolver: async () => undefined
      }
    );

    expect(forceOverwriteCode).toBe(EXIT_POLICY.OK);

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
    expect(dryRunCode).toBe(EXIT_POLICY.OK);
    expect(dryRunStreams.out.stdout).toContain("ExistingVault");

    const writeStreams = createStreams();
    const writeCode = await runCli(["config", "init", "--write", "--force"], {
      env: { HOME: home },
      streams: writeStreams,
      runResolver: async () => undefined
    });
    expect(writeCode).toBe(EXIT_POLICY.OK);
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
    expect(dryRunCode).toBe(EXIT_POLICY.OK);
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
    expect(writeCode).toBe(EXIT_POLICY.OK);
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

    expect(code).toBe(EXIT_POLICY.OK);
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

    expect(code).toBe(EXIT_POLICY.OK);
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

    expect(code).toBe(EXIT_POLICY.OK);
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

    expect(code).toBe(EXIT_POLICY.ERROR);
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
    expect(defaultsJsonCode).toBe(EXIT_POLICY.OK);
    const defaultsJson = JSON.parse(defaultsJsonStreams.out.stdout) as Record<string, unknown>;
    expect(defaultsJson.defaultVault).toBe("default");

    const defaultsHumanStreams = createStreams();
    const defaultsHumanCode = await runCli(["config", "show", "--defaults"], {
      env: { HOME: home },
      streams: defaultsHumanStreams,
      runResolver: async () => undefined
    });
    expect(defaultsHumanCode).toBe(EXIT_POLICY.OK);
    expect(defaultsHumanStreams.out.stdout).toContain("DEFAULT CONFIGURATION");

    const currentFileJsonStreams = createStreams();
    const currentFileJsonCode = await runCli(["config", "show", "--current-file", "--json"], {
      env: { HOME: home },
      streams: currentFileJsonStreams,
      runResolver: async () => undefined
    });
    expect(currentFileJsonCode).toBe(EXIT_POLICY.OK);
    const currentFileJson = JSON.parse(currentFileJsonStreams.out.stdout) as Record<string, unknown>;
    expect(currentFileJson.defaultVault).toBe("MainVault");

    const currentFileHumanStreams = createStreams();
    const currentFileHumanCode = await runCli(["config", "show", "--current-file"], {
      env: { HOME: home },
      streams: currentFileHumanStreams,
      runResolver: async () => undefined
    });
    expect(currentFileHumanCode).toBe(EXIT_POLICY.OK);
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

    expect(code).toBe(EXIT_POLICY.OK);
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
    expect(missingCode).toBe(EXIT_POLICY.ERROR);
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
    expect(malformedCode).toBe(EXIT_POLICY.ERROR);
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
      expect(code).toBe(EXIT_POLICY.ERROR);
      expect(streams.out.stderr).toContain("Resolved config file is not readable.");
    } finally {
      chmodSync(configPath, 0o600);
    }
  });

  it("openclaw snippet outputs json by default", async () => {
    const streams = createStreams();
    const code = await runCli(["openclaw", "snippet"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams,
      runResolver: async () => undefined
    });

    expect(code).toBe(EXIT_POLICY.OK);
    const parsed = JSON.parse(streams.out.stdout) as {
      providers: Array<{ name: string; kind: string; config: { jsonOnly: boolean; passEnv: string[] } }>;
    };
    expect(parsed.providers[0].name).toBe("1p-sdk-resolver");
    expect(parsed.providers[0].kind).toBe("exec");
    expect(parsed.providers[0].config.jsonOnly).toBe(true);
    expect(parsed.providers[0].config.passEnv).toContain("OP_SERVICE_ACCOUNT_TOKEN");
    expect(streams.out.stderr).toBe("");
  });

  it("openclaw snippet supports provider and command overrides", async () => {
    const streams = createStreams();
    const code = await runCli(
      ["openclaw", "snippet", "--provider", "op_sdk", "--command", "/usr/local/bin/openclaw-1p-sdk-resolver"],
      {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams,
      runResolver: async () => undefined
      }
    );

    expect(code).toBe(EXIT_POLICY.OK);
    const parsed = JSON.parse(streams.out.stdout) as {
      providers: Array<{ name: string; kind: string; config: { command: string; jsonOnly: boolean; passEnv: string[] } }>;
    };
    expect(parsed.providers[0].name).toBe("op_sdk");
    expect(parsed.providers[0].kind).toBe("exec");
    expect(parsed.providers[0].config.command).toBe("/usr/local/bin/openclaw-1p-sdk-resolver");
    expect(parsed.providers[0].config.jsonOnly).toBe(true);
    expect(parsed.providers[0].config.passEnv).toContain("OP_SERVICE_ACCOUNT_TOKEN");
    expect(streams.out.stderr).toBe("");
  });

  it("openclaw snippet prints instructions on tty stderr by default", async () => {
    const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
    const stdout = new PassThrough() as PassThrough & { isTTY?: boolean };
    const stderr = new PassThrough() as PassThrough & { isTTY?: boolean };
    stdin.isTTY = false;
    stdout.isTTY = false;
    stderr.isTTY = true;
    let out = "";
    let err = "";
    stdout.on("data", (chunk: Buffer | string) => {
      out += chunk.toString();
    });
    stderr.on("data", (chunk: Buffer | string) => {
      err += chunk.toString();
    });

    const code = await runCli(["openclaw", "snippet"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: { stdin, stdout, stderr },
      runResolver: async () => undefined
    });
    expect(code).toBe(EXIT_POLICY.OK);
    expect(() => JSON.parse(out)).not.toThrow();
    expect(err).toContain("Paste this JSON into secrets.providers");
    expect(err).toContain("Likely OpenClaw config path:");
    expect(err).toContain("Path source: HOME (Using HOME/.openclaw/openclaw.json.)");
    expect(err.endsWith("\n\n")).toBe(true);
  });

  it("openclaw snippet supports --explain and --quiet precedence", async () => {
    const explainStreams = createStreams();
    const explainCode = await runCli(["openclaw", "snippet", "--explain"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: explainStreams,
      runResolver: async () => undefined
    });
    expect(explainCode).toBe(EXIT_POLICY.OK);
    expect(explainStreams.out.stderr).toContain("This tool does not edit OpenClaw files.");
    expect(explainStreams.out.stderr).toContain("Likely OpenClaw config path:");
    expect(explainStreams.out.stderr).toContain("Path source: HOME (Using HOME/.openclaw/openclaw.json.)");
    expect(explainStreams.out.stderr.endsWith("\n\n")).toBe(true);

    const ttyIn = new PassThrough() as PassThrough & { isTTY?: boolean };
    const ttyOut = new PassThrough() as PassThrough & { isTTY?: boolean };
    const ttyErr = new PassThrough() as PassThrough & { isTTY?: boolean };
    ttyErr.isTTY = true;
    let quietErr = "";
    ttyErr.on("data", (chunk: Buffer | string) => {
      quietErr += chunk.toString();
    });
    const quietCode = await runCli(["openclaw", "snippet", "--quiet"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: { stdin: ttyIn, stdout: ttyOut, stderr: ttyErr },
      runResolver: async () => undefined
    });
    expect(quietCode).toBe(EXIT_POLICY.OK);
    expect(quietErr).toBe("");

    const precedenceStreams = createStreams();
    const precedenceCode = await runCli(["openclaw", "snippet", "--quiet", "--explain"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: precedenceStreams,
      runResolver: async () => undefined
    });
    expect(precedenceCode).toBe(EXIT_POLICY.OK);
    expect(precedenceStreams.out.stderr).toBe("");
  });

  it("openclaw check --json reports provider findings and sdk status", async () => {
    const root = path.join(tmpdir(), `onep-cli-check-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(root, { recursive: true });
    const configPath = path.join(root, "openclaw.json");
    writeFileSync(configPath, JSON.stringify({ providers: [] }), "utf8");

    const streams = createStreams();
    const code = await runCli(["openclaw", "check", "--path", configPath, "--json"], {
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

    expect(code).toBe(EXIT_POLICY.OK);
    const parsed = JSON.parse(streams.out.stdout) as {
      status: string;
      provider: { providerFound: boolean; findings: Array<{ code: string }> };
      resolver: { tokenPresent: boolean; sdkStatus: string };
      actions: string[];
    };
    expect(parsed.status).toBe("findings");
    expect(parsed.provider.providerFound).toBe(false);
    expect(parsed.provider.findings.some((finding) => finding.code === "provider_missing")).toBe(true);
    expect(parsed.resolver.tokenPresent).toBe(true);
    expect(parsed.resolver.sdkStatus).toBe("ok");
    expect(parsed.actions.length).toBeGreaterThan(0);
  });

  it("openclaw check --strict returns findings exit code and parse/read errors", async () => {
    const root = path.join(tmpdir(), `onep-cli-check-check-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(root, { recursive: true });
    const cfg = path.join(root, "openclaw.json");
    writeFileSync(cfg, "{\"providers\":[]}\n", "utf8");

    const findingsStreams = createStreams();
    const findingsCode = await runCli(["openclaw", "check", "--strict", "--path", cfg], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: findingsStreams,
      runResolver: async () => undefined
    });
    expect(findingsCode).toBe(EXIT_POLICY.FINDINGS);

    const nonStrictStreams = createStreams();
    const nonStrictCode = await runCli(["openclaw", "check", "--check", "--path", cfg], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: nonStrictStreams,
      runResolver: async () => undefined
    });
    expect(nonStrictCode).toBe(EXIT_POLICY.OK);

    const parseStreams = createStreams();
    writeFileSync(cfg, "{ invalid", "utf8");
    const parseCode = await runCli(["openclaw", "check", "--path", cfg], {
      env: {},
      streams: parseStreams,
      runResolver: async () => undefined
    });
    expect(parseCode).toBe(EXIT_POLICY.ERROR);

    const unreadableStreams = createStreams();
    chmodSync(cfg, 0o000);
    try {
      const unreadableCode = await runCli(["openclaw", "check", "--path", cfg], {
        env: {},
        streams: unreadableStreams,
        runResolver: async () => undefined
      });
      expect(unreadableCode).toBe(EXIT_POLICY.ERROR);
    } finally {
      chmodSync(cfg, 0o600);
    }
  });

  it("openclaw check returns runtime exit code when sdk init fails", async () => {
    const root = path.join(tmpdir(), `onep-cli-check-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(root, { recursive: true });
    writeFileSync(path.join(root, "openclaw.json"), "{\"providers\":[]}\n", "utf8");
    const streams = createStreams();
    const code = await runCli(["openclaw", "check", "--json", "--path", path.join(root, "openclaw.json")], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      runResolver: async () => undefined,
      createResolver: async () => {
        throw new Error("sdk-down");
      }
    });
    expect(code).toBe(EXIT_POLICY.RUNTIME);
    const parsed = JSON.parse(streams.out.stdout) as { status: string };
    expect(parsed.status).toBe("runtime-error");
  });

  it("openclaw check --details includes extended resolver config details", async () => {
    const root = path.join(tmpdir(), `onep-cli-diagnose-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(root, { recursive: true });
    const cfg = path.join(root, "openclaw.json");
    writeFileSync(
      cfg,
      JSON.stringify({
        secrets: {
          providers: [
            {
              name: "resolver",
              kind: "exec",
              config: {
                jsonOnly: true,
                command: "/abs/path/openclaw-1p-sdk-resolver",
                passEnv: ["HOME", "OP_SERVICE_ACCOUNT_TOKEN", "OP_RESOLVER_CONFIG"]
              }
            }
          ]
        }
      }),
      "utf8"
    );
    const streams = createStreams();
    const code = await runCli(["openclaw", "check", "--details", "--json", "--path", cfg], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams,
      runResolver: async () => undefined
    });
    expect(code).toBe(EXIT_POLICY.OK);
    const parsed = JSON.parse(streams.out.stdout) as {
      status: string;
      resolverConfig: Record<string, unknown>;
      resolverProvenance: Record<string, unknown>;
      provider: { findings: unknown[] };
    };
    expect(parsed.status).toBe("findings");
    expect(parsed.provider.findings).toEqual([]);
    expect(parsed.resolverConfig.defaultVault).toBe("MainVault");
    expect(parsed.resolverProvenance.defaultVault).toBeDefined();
  });

  it("1password check --json reports readiness without leaking token", async () => {
    const streams = createStreams();
    const token = "op_secret_token_for_onepassword_check";
    const code = await runCli(["1password", "check", "--json"], {
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
    expect(code).toBe(EXIT_POLICY.OK);
    const parsed = JSON.parse(streams.out.stdout) as {
      status: string;
      tokenPresent: boolean;
      sdkStatus: string;
      config: { valid: boolean };
      probe: { requested: boolean; status: string; reason: string };
    };
    expect(parsed.status).toBe("clean");
    expect(parsed.tokenPresent).toBe(true);
    expect(parsed.sdkStatus).toBe("ok");
    expect(parsed.config.valid).toBe(true);
    expect(parsed.probe.requested).toBe(false);
    expect(streams.out.stdout.includes(token)).toBe(false);
  });

  it("1password check returns error for missing token and runtime for sdk init failure", async () => {
    const missingTokenStreams = createStreams();
    const missingTokenCode = await runCli(["1password", "check", "--json"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: missingTokenStreams,
      runResolver: async () => undefined
    });
    expect(missingTokenCode).toBe(EXIT_POLICY.ERROR);
    const missingParsed = JSON.parse(missingTokenStreams.out.stdout) as { status: string };
    expect(missingParsed.status).toBe("error");

    const sdkFailStreams = createStreams();
    const sdkFailCode = await runCli(["1password", "check", "--json"], {
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
    expect(sdkFailCode).toBe(EXIT_POLICY.RUNTIME);
    const sdkFailParsed = JSON.parse(sdkFailStreams.out.stdout) as { status: string };
    expect(sdkFailParsed.status).toBe("runtime-error");
  });

  it("1password check --strict returns findings for unresolved probe", async () => {
    const streams = createStreams();
    const code = await runCli(["1password", "check", "--json", "--strict", "--probe-id", "MyAPI/token"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      runResolver: async () => undefined,
      resolver: {
        resolveRefs: async () => new Map<string, string>()
      }
    });
    expect(code).toBe(EXIT_POLICY.FINDINGS);
    const parsed = JSON.parse(streams.out.stdout) as { status: string; probe: { status: string; reason: string } };
    expect(parsed.status).toBe("findings");
    expect(parsed.probe.status).toBe("unresolved");
    expect(parsed.probe.reason).toBe("sdk-unresolved");
  });

  it("1password check probe resolved/unresolved reasons are safe and deterministic", async () => {
    const resolvedStreams = createStreams();
    const resolvedCode = await runCli(["1password", "check", "--json", "--probe-id", "MyAPI/token"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault", vaultPolicy: "default_vault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams: resolvedStreams,
      runResolver: async () => undefined,
      resolver: {
        resolveRefs: async (refs: string[]) => new Map([[refs[0], "very-secret-value"]])
      }
    });
    expect(resolvedCode).toBe(EXIT_POLICY.OK);
    expect(resolvedStreams.out.stdout.includes("very-secret-value")).toBe(false);
    expect(resolvedStreams.out.stdout.includes("MyAPI/token")).toBe(false);
    const resolvedParsed = JSON.parse(resolvedStreams.out.stdout) as {
      probe: { requested: boolean; status: string; reason: string; id?: string };
    };
    expect(resolvedParsed.probe.requested).toBe(true);
    expect(resolvedParsed.probe.status).toBe("resolved");
    expect(resolvedParsed.probe.reason).toBe("resolved");
    expect(resolvedParsed.probe.id).toBeUndefined();

    const policyBlockedStreams = createStreams();
    const policyBlockedCode = await runCli(
      ["1password", "check", "--json", "--probe-id", "op://OtherVault/Item/field"],
      {
        env: {
          HOME: createHomeWithConfig({ defaultVault: "MainVault", vaultPolicy: "default_vault" }),
          OP_SERVICE_ACCOUNT_TOKEN: "token"
        },
        streams: policyBlockedStreams,
        runResolver: async () => undefined,
        resolver: {
          resolveRefs: async () => new Map<string, string>()
        }
      }
    );
    expect(policyBlockedCode).toBe(EXIT_POLICY.OK);
    const policyBlockedParsed = JSON.parse(policyBlockedStreams.out.stdout) as {
      probe: { status: string; reason: string };
    };
    expect(policyBlockedParsed.probe.status).toBe("filtered");
    expect(policyBlockedParsed.probe.reason).toBe("policy-blocked");

    const invalidRefStreams = createStreams();
    const invalidRefCode = await runCli(["1password", "check", "--json", "--probe-id", "bad\nid"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams: invalidRefStreams,
      runResolver: async () => undefined,
      createResolver: async () => ({
        resolveRefs: async () => new Map<string, string>()
      })
    });
    expect(invalidRefCode).toBe(EXIT_POLICY.OK);
    const invalidRefParsed = JSON.parse(invalidRefStreams.out.stdout) as { probe: { status: string; reason: string } };
    expect(invalidRefParsed.probe.status).toBe("filtered");
    expect(invalidRefParsed.probe.reason).toBe("invalid-ref");
  });

  it("1password check only includes probe id in --debug mode", async () => {
    const nonDebugStreams = createStreams();
    const nonDebugCode = await runCli(["1password", "check", "--json", "--probe-id", "MyAPI/token"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault", vaultPolicy: "default_vault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams: nonDebugStreams,
      runResolver: async () => undefined,
      resolver: {
        resolveRefs: async (refs: string[]) => new Map([[refs[0], "hidden"]])
      }
    });
    expect(nonDebugCode).toBe(EXIT_POLICY.OK);
    const nonDebugParsed = JSON.parse(nonDebugStreams.out.stdout) as { probe: { id?: string } };
    expect(nonDebugParsed.probe.id).toBeUndefined();

    const debugStreams = createStreams();
    const debugCode = await runCli(["1password", "check", "--json", "--debug", "--probe-id", "MyAPI/token"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault", vaultPolicy: "default_vault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams: debugStreams,
      runResolver: async () => undefined,
      resolver: {
        resolveRefs: async (refs: string[]) => new Map([[refs[0], "hidden"]])
      }
    });
    expect(debugCode).toBe(EXIT_POLICY.OK);
    const debugParsed = JSON.parse(debugStreams.out.stdout) as { probe: { id?: string } };
    expect(debugParsed.probe.id).toBe("MyAPI/token");
  });

  it("1password check --details --json includes resolver internals and policy summary", async () => {
    const streams = createStreams();
    const code = await runCli(["1password", "check", "--details", "--json", "--probe-id", "MyAPI/token"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault", vaultPolicy: "default_vault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      runResolver: async () => undefined,
      resolver: {
        resolveRefs: async (refs: string[]) => new Map([[refs[0], "hidden-secret"]])
      }
    });
    expect(code).toBe(EXIT_POLICY.OK);
    const parsed = JSON.parse(streams.out.stdout) as {
      resolverConfig: Record<string, unknown>;
      resolverProvenance: Record<string, unknown>;
      resolverIssues: unknown[];
      policy: { defaultVault: string; vaultPolicy: string; vaultWhitelistCount: number; allowedIdRegexState: string };
    };
    expect(parsed.resolverConfig.defaultVault).toBe("MainVault");
    expect(parsed.resolverProvenance.defaultVault).toBeDefined();
    expect(Array.isArray(parsed.resolverIssues)).toBe(true);
    expect(parsed.policy.defaultVault).toBe("MainVault");
    expect(parsed.policy.vaultPolicy).toBe("default_vault");
    expect(typeof parsed.policy.vaultWhitelistCount).toBe("number");
    expect(typeof parsed.policy.allowedIdRegexState).toBe("string");
    expect(streams.out.stdout.includes("hidden-secret")).toBe(false);
  });

  it("1password check --details reports configured allowedIdRegex policy state", async () => {
    const home = createHomeWithConfig({
      defaultVault: "MainVault",
      vaultPolicy: "default_vault",
      allowedIdRegex: "^[A-Za-z0-9_\\/-]+$"
    });
    const streams = createStreams();
    const code = await runCli(["1password", "check", "--details", "--json"], {
      env: {
        HOME: home,
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      runResolver: async () => undefined,
      createResolver: async () => ({
        resolveRefs: async () => new Map<string, string>()
      })
    });
    expect(code).toBe(EXIT_POLICY.OK);
    const parsed = JSON.parse(streams.out.stdout) as { policy: { allowedIdRegexState: string } };
    expect(parsed.policy.allowedIdRegexState).toBe("configured");
  });

  it("1password check --details reports fail-closed allowedIdRegex policy state", async () => {
    const home = createHomeWithConfig({
      defaultVault: "MainVault",
      vaultPolicy: "default_vault",
      allowedIdRegex: "["
    });
    const streams = createStreams();
    const code = await runCli(["1password", "check", "--details", "--json"], {
      env: {
        HOME: home,
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      runResolver: async () => undefined,
      createResolver: async () => ({
        resolveRefs: async () => new Map<string, string>()
      })
    });
    expect(code).toBe(EXIT_POLICY.ERROR);
    const parsed = JSON.parse(streams.out.stdout) as { policy: { allowedIdRegexState: string } };
    expect(parsed.policy.allowedIdRegexState).toBe("fail-closed");
  });

  it("1password snippet outputs minimal/full json and enforces defaultVault requirement", async () => {
    const missingStreams = createStreams();
    const missingCode = await runCli(["1password", "snippet"], {
      env: {},
      streams: missingStreams,
      runResolver: async () => undefined
    });
    expect(missingCode).toBe(EXIT_POLICY.ERROR);
    expect(missingStreams.out.stderr).toContain("defaultVault is required");

    const minimalStreams = createStreams();
    const minimalCode = await runCli(["1password", "snippet", "--default-vault", "VaultOne"], {
      env: {},
      streams: minimalStreams,
      runResolver: async () => undefined
    });
    expect(minimalCode).toBe(EXIT_POLICY.OK);
    const minimalParsed = JSON.parse(minimalStreams.out.stdout) as Record<string, unknown>;
    expect(minimalParsed.defaultVault).toBe("VaultOne");
    expect(minimalParsed.vaultPolicy).toBe("default_vault");

    const fallbackStreams = createStreams();
    const fallbackCode = await runCli(["1password", "snippet"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "ExistingVault", vaultPolicy: "default_vault" }) },
      streams: fallbackStreams,
      runResolver: async () => undefined
    });
    expect(fallbackCode).toBe(EXIT_POLICY.OK);
    const fallbackParsed = JSON.parse(fallbackStreams.out.stdout) as Record<string, unknown>;
    expect(fallbackParsed.defaultVault).toBe("ExistingVault");

    const fullStreams = createStreams();
    const fullCode = await runCli(["1password", "snippet", "--full"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "FullVault", vaultPolicy: "default_vault" }) },
      streams: fullStreams,
      runResolver: async () => undefined
    });
    expect(fullCode).toBe(EXIT_POLICY.OK);
    const fullParsed = JSON.parse(fullStreams.out.stdout) as Record<string, unknown>;
    expect(fullParsed.defaultVault).toBe("FullVault");
    expect(fullParsed.maxIds).toBeDefined();
  });

  it("1password snippet prints tty instructions and supports explain/quiet controls", async () => {
    const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
    const stdout = new PassThrough() as PassThrough & { isTTY?: boolean };
    const stderr = new PassThrough() as PassThrough & { isTTY?: boolean };
    stderr.isTTY = true;
    let out = "";
    let err = "";
    stdout.on("data", (chunk: Buffer | string) => {
      out += chunk.toString();
    });
    stderr.on("data", (chunk: Buffer | string) => {
      err += chunk.toString();
    });
    const code = await runCli(["1password", "snippet", "--default-vault", "MainVault"], {
      env: {},
      streams: { stdin, stdout, stderr },
      runResolver: async () => undefined
    });
    expect(code).toBe(EXIT_POLICY.OK);
    expect(() => JSON.parse(out)).not.toThrow();
    expect(err).toContain("No tokens or secret values are included.");

    const explainStreams = createStreams();
    const explainCode = await runCli(["1password", "snippet", "--default-vault", "MainVault", "--explain"], {
      env: {},
      streams: explainStreams,
      runResolver: async () => undefined
    });
    expect(explainCode).toBe(EXIT_POLICY.OK);
    expect(explainStreams.out.stderr).toContain("Save this JSON as resolver config");

    const quietStreams = createStreams();
    const quietCode = await runCli(
      ["1password", "snippet", "--default-vault", "MainVault", "--quiet", "--explain"],
      {
        env: {},
        streams: quietStreams,
        runResolver: async () => undefined
      }
    );
    expect(quietCode).toBe(EXIT_POLICY.OK);
    expect(quietStreams.out.stderr).toBe("");
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

    expect(code).toBe(EXIT_POLICY.OK);
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

    expect(noYesCode).toBe(EXIT_POLICY.ERROR);
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

    expect(yesCode).toBe(EXIT_POLICY.OK);
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

    expect(code).toBe(EXIT_POLICY.OK);
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

    expect(code).toBe(EXIT_POLICY.FINDINGS);
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

    expect(code).toBe(EXIT_POLICY.FINDINGS);
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
    expect(stdinCode).toBe(EXIT_POLICY.OK);

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
    expect(runtimeFailCode).toBe(EXIT_POLICY.RUNTIME);
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
    expect(invalidConfigCode).toBe(EXIT_POLICY.ERROR);
    expect(invalidConfigStreams.out.stderr).toContain("Configuration is invalid");

    const missingTokenStreams = createStreams();
    const missingTokenCode = await runCli(["resolve", "--id", "MyAPI/token"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: missingTokenStreams,
      runResolver: async () => undefined
    });
    expect(missingTokenCode).toBe(EXIT_POLICY.ERROR);
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

    expect(code).toBe(EXIT_POLICY.OK);
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
    expect(code).toBe(EXIT_POLICY.FINDINGS);
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
    expect(code).toBe(EXIT_POLICY.FINDINGS);
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
    expect(code).toBe(EXIT_POLICY.OK);
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
    expect(code).toBe(EXIT_POLICY.FINDINGS);
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

    expect(code).toBe(EXIT_POLICY.ERROR);
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
    expect(code).toBe(EXIT_POLICY.ERROR);
    expect(streams.out.stderr).toContain("Unable to resolve config path.");
  });

  it("returns code 2 for unknown commands and subcommands", async () => {
    const unknownCommandStreams = createStreams();
    const unknownCommandCode = await runCli(["unknown-command"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: unknownCommandStreams,
      runResolver: async () => undefined
    });
    expect(unknownCommandCode).toBe(EXIT_POLICY.ERROR);
    expect(unknownCommandStreams.out.stderr).toContain("Unknown command: unknown-command");

    const unknownConfigSubcommandStreams = createStreams();
    const unknownConfigSubcommandCode = await runCli(["config", "bad-subcommand"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: unknownConfigSubcommandStreams,
      runResolver: async () => undefined
    });
    expect(unknownConfigSubcommandCode).toBe(EXIT_POLICY.ERROR);
    expect(unknownConfigSubcommandStreams.out.stderr).toContain("Unknown config subcommand");

    const unknownOpenclawSubcommandStreams = createStreams();
    const unknownOpenclawSubcommandCode = await runCli(["openclaw", "bad-subcommand"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: unknownOpenclawSubcommandStreams,
      runResolver: async () => undefined
    });
    expect(unknownOpenclawSubcommandCode).toBe(EXIT_POLICY.ERROR);
    expect(unknownOpenclawSubcommandStreams.out.stderr).toContain("Unknown openclaw subcommand");

    const unknownOnepasswordSubcommandStreams = createStreams();
    const unknownOnepasswordSubcommandCode = await runCli(["1password", "bad-subcommand"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: unknownOnepasswordSubcommandStreams,
      runResolver: async () => undefined
    });
    expect(unknownOnepasswordSubcommandCode).toBe(EXIT_POLICY.ERROR);
    expect(unknownOnepasswordSubcommandStreams.out.stderr).toContain("Unknown 1password subcommand");

    const removedOpenclawDiagnoseStreams = createStreams();
    const removedOpenclawDiagnoseCode = await runCli(["openclaw", "diagnose"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: removedOpenclawDiagnoseStreams,
      runResolver: async () => undefined
    });
    expect(removedOpenclawDiagnoseCode).toBe(EXIT_POLICY.ERROR);
    expect(removedOpenclawDiagnoseStreams.out.stderr).toContain("Unknown openclaw subcommand. Use: check | snippet");

    const removedOnepasswordDiagnoseStreams = createStreams();
    const removedOnepasswordDiagnoseCode = await runCli(["1password", "diagnose"], {
      env: { HOME: createHomeWithConfig({ defaultVault: "MainVault" }) },
      streams: removedOnepasswordDiagnoseStreams,
      runResolver: async () => undefined
    });
    expect(removedOnepasswordDiagnoseCode).toBe(EXIT_POLICY.ERROR);
    expect(removedOnepasswordDiagnoseStreams.out.stderr).toContain("Unknown 1password subcommand. Use: check | snippet");
  });

  it("accepts 1p as shorthand for 1password command group", async () => {
    const streams = createStreams();
    const code = await runCli(["1p", "check", "--json"], {
      env: {
        HOME: createHomeWithConfig({ defaultVault: "MainVault" }),
        OP_SERVICE_ACCOUNT_TOKEN: "token"
      },
      streams,
      createResolver: async () => ({
        resolveAll: async () => ({}),
        resolve: async () => undefined
      }),
      runResolver: async () => undefined
    });

    expect(code).toBe(EXIT_POLICY.OK);
    const parsed = JSON.parse(streams.out.stdout) as { status: string };
    expect(parsed.status).toBe("clean");
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
    expect(code).toBe(EXIT_POLICY.OK);
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
