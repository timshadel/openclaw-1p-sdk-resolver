import { createHash } from "node:crypto";
import {
  closeSync,
  accessSync,
  chmodSync,
  constants as fsConstants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { stdin as processStdin, stdout as processStdout, stderr as processStderr } from "node:process";
import readline from "node:readline/promises";
import { EXIT_POLICY, type ExitCode } from "./exit-policy.js";
import { createOnePasswordResolver, isValidSecretReference, type SecretResolver } from "./onepassword.js";
import {
  buildResolverProviderSnippet,
  DEFAULT_OPENCLAW_PROVIDER_ALIAS,
  checkOpenclawProviderSetup,
  parseOpenclawConfigText,
  resolveOpenclawConfigPath
} from "./openclaw.js";
import { loadEffectiveConfig, type ConfigIssue, type EffectiveConfig } from "./protocol.js";
import { extractVaultFromReference, isVaultAllowed, mapIdToReference, sanitizeIds } from "./sanitize.js";

/**
 * CLI command surface and diagnostics orchestration.
 * Handles subcommand parsing, safe human/json output formatting, and reveal gating.
 */
type CliStreams = {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
};

type CliRuntime = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  entryScriptPath?: string;
  streams?: Partial<CliStreams>;
  resolver?: SecretResolver;
  createResolver?: typeof createOnePasswordResolver;
  confirmReveal?: () => Promise<boolean>;
  runResolver: (runtime?: {
    env?: NodeJS.ProcessEnv;
    stdin?: NodeJS.ReadableStream;
    stdout?: NodeJS.WritableStream;
    resolver?: SecretResolver;
  }) => Promise<void>;
};

type ExitResult = {
  code: ExitCode;
};

type CliExecutionContext = {
  env: NodeJS.ProcessEnv;
  streams: CliStreams;
  cwd: string;
  entryScriptPath?: string;
};

type TableColumn = {
  header: string;
  maxWidth?: number;
};

export type ResolveRow = {
  id: string;
  status: "resolved" | "unresolved";
  output: string;
  reason: string;
};

type OnePasswordProbeReason =
  | "resolved"
  | "sdk-unresolved"
  | "policy-blocked"
  | "invalid-ref"
  | "config-invalid"
  | "token-missing"
  | "sdk-init-failed"
  | "probe-runtime-failed"
  | "not-requested";

export type OnePasswordProbeResult = {
  requested: boolean;
  id?: string;
  status: "resolved" | "unresolved" | "filtered" | "skipped";
  reason: OnePasswordProbeReason;
};

export type OnePasswordCheckPayload = {
  status: "clean" | "findings" | "error" | "runtime-error";
  checkMode: boolean;
  tokenPresent: boolean;
  sdkStatus: "ok" | "skipped" | "error";
  config: {
    path: EffectiveConfig["path"];
    valid: boolean;
    errors: number;
    warnings: number;
  };
  probe: OnePasswordProbeResult;
  issues: Array<{ code: string; message: string; key?: string; level?: string }>;
};

export type OnePasswordDiagnosePayload = OnePasswordCheckPayload & {
  resolverConfig: Record<string, unknown>;
  resolverProvenance: Record<string, { value: unknown; source: string; notes: string[] }>;
  resolverIssues: ConfigIssue[];
  policy: {
    defaultVault: string;
    vaultPolicy: string;
    vaultWhitelistCount: number;
    allowedIdRegexState: "unset" | "configured" | "fail-closed";
  };
};

type SafeWriteFsOps = {
  openSync: typeof openSync;
  writeFileSync: typeof writeFileSync;
  closeSync: typeof closeSync;
};

function normalizeStreams(runtime: CliRuntime): CliStreams {
  return {
    stdin: runtime.streams?.stdin ?? processStdin,
    stdout: runtime.streams?.stdout ?? processStdout,
    stderr: runtime.streams?.stderr ?? processStderr
  };
}

function normalizeExecutionContext(runtime: CliRuntime): CliExecutionContext {
  return {
    env: runtime.env ?? process.env,
    streams: normalizeStreams(runtime),
    cwd: runtime.cwd ?? process.cwd(),
    entryScriptPath: runtime.entryScriptPath ?? process.argv[1]
  };
}

function isTruthyFlag(value: string | undefined): boolean {
  return value === "true" || value === "1" || value === "yes";
}

export function parseFlags(args: string[]): { positionals: string[]; flags: Map<string, string[]> } {
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }

    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const withoutPrefix = token.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");
    const key = equalsIndex >= 0 ? withoutPrefix.slice(0, equalsIndex) : withoutPrefix;
    const explicitValue = equalsIndex >= 0 ? withoutPrefix.slice(equalsIndex + 1) : undefined;

    if (!key) {
      continue;
    }

    let value = explicitValue;
    if (value === undefined && i + 1 < args.length && !args[i + 1].startsWith("--")) {
      value = args[i + 1];
      i += 1;
    }

    const values = flags.get(key) ?? [];
    values.push(value ?? "true");
    flags.set(key, values);
  }

  return { positionals, flags };
}

export function getLastFlag(flags: Map<string, string[]>, name: string): string | undefined {
  const values = flags.get(name);
  if (!values || values.length === 0) {
    return undefined;
  }
  return values[values.length - 1];
}

export function hasFlag(flags: Map<string, string[]>, name: string): boolean {
  return flags.has(name) && isTruthyFlag(getLastFlag(flags, name));
}

export function getStringFlag(flags: Map<string, string[]>, name: string): string | undefined {
  if (!flags.has(name)) {
    return undefined;
  }
  const raw = getLastFlag(flags, name);
  if (!raw || raw === "true") {
    return undefined;
  }
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

function toSerializableConfig(config: EffectiveConfig["config"]): Record<string, unknown> {
  return {
    ...config,
    allowedIdRegex: config.allowedIdRegex ? config.allowedIdRegex.source : undefined
  };
}

function toSerializableProvenance(config: EffectiveConfig): Record<string, { value: unknown; source: string; notes: string[] }> {
  const entries = Object.entries(config.provenance).map(([key, entry]) => {
    const value = key === "allowedIdRegex" && entry.value instanceof RegExp ? entry.value.source : entry.value;
    return [
      key,
      {
        value,
        source: entry.source,
        notes: [...entry.notes]
      }
    ];
  });

  return Object.fromEntries(entries);
}

function printJson(stream: NodeJS.WritableStream, value: unknown): void {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}

function shouldPrintSnippetInstructions(flags: Map<string, string[]>, streams: CliStreams): boolean {
  if (hasFlag(flags, "quiet")) {
    return false;
  }
  if (hasFlag(flags, "explain")) {
    return true;
  }
  return Boolean((streams.stderr as NodeJS.WriteStream).isTTY);
}

function resolveOpenclawResolverCommandHint(entryScriptPath?: string): string {
  const commandName = "openclaw-1p-sdk-resolver";
  if (!entryScriptPath) {
    return `/path/to/${commandName}`;
  }

  const looksAbsolute = path.isAbsolute(entryScriptPath);
  const resolved = path.resolve(entryScriptPath);
  const basenameMatches = path.basename(resolved) === commandName;
  const looksPackageManagerInternal =
    (resolved.includes("/.pnpm/") && resolved.includes("/node_modules/")) ||
    (resolved.includes("/Cellar/") && resolved.includes("/lib/node_modules/"));

  if (looksAbsolute && basenameMatches && !looksPackageManagerInternal) {
    return resolved;
  }

  return `/path/to/${commandName}`;
}

function printSnippetInstructions(
  stream: NodeJS.WritableStream,
  lines: string[],
  options?: { trailingBlankLine?: boolean }
): void {
  for (const line of lines) {
    stream.write(`${line}\n`);
  }
  if (options?.trailingBlankLine) {
    stream.write("\n");
  }
}

function printUsage(stream: NodeJS.WritableStream): void {
  stream.write(`openclaw-1p-sdk-resolver\n\n`);
  stream.write(`Usage:\n`);
  stream.write(`  openclaw-1p-sdk-resolver                    # resolver mode (stdin protocol)\n`);
  stream.write(`  openclaw-1p-sdk-resolver doctor [--json]\n`);
  stream.write(`  openclaw-1p-sdk-resolver config path [--json]\n`);
  stream.write(`  openclaw-1p-sdk-resolver config show [--json] [--defaults] [--current-file] [--verbose]\n`);
  stream.write(`  openclaw-1p-sdk-resolver config init [--default-vault <name>] [--write] [--force] [--json]\n`);
  stream.write(`  openclaw-1p-sdk-resolver openclaw snippet [--provider <alias>] [--command <path>] [--explain] [--quiet]\n`);
  stream.write(
    `  openclaw-1p-sdk-resolver openclaw check [--path <openclaw.json>] [--provider <alias>] [--json] [--strict] [--details]\n`
  );
  stream.write(
    `  openclaw-1p-sdk-resolver 1password check [--json] [--strict] [--details] [--probe-id <id>] [--probe-timeout-ms <n>] [--debug]\n`
  );
  stream.write(
    `  openclaw-1p-sdk-resolver 1password snippet [--default-vault <name>] [--full] [--json] [--explain] [--quiet]\n`
  );
  stream.write(`  openclaw-1p-sdk-resolver 1p <check|snippet> [...flags]  # shorthand alias\n`);
  stream.write(
    `  openclaw-1p-sdk-resolver resolve --id <id> [--id <id>] [--stdin] [--json] [--debug] [--reveal --yes]\n`
  );
}

export function truncateCell(value: string, maxWidth: number): string {
  if (value.length <= maxWidth) {
    return value;
  }
  if (maxWidth <= 3) {
    return value.slice(0, maxWidth);
  }
  return `${value.slice(0, maxWidth - 3)}...`;
}

function padRight(value: string, width: number): string {
  return value.padEnd(width, " ");
}

export function displayValue(value: unknown): string {
  if (value === undefined) {
    return "-";
  }
  if (value === null) {
    return "null";
  }
  if (value instanceof RegExp) {
    return value.source;
  }
  const serialized = JSON.stringify(value);
  if (typeof serialized === "string") {
    return serialized;
  }
  return String(value);
}

export function renderAsciiTable(columns: TableColumn[], rows: string[][]): string {
  const widths = columns.map((column, index) => {
    const contentWidths = rows.map((row) => row[index]?.length ?? 0);
    const widestContent = Math.max(column.header.length, ...contentWidths);
    if (column.maxWidth && column.maxWidth > 0) {
      return Math.min(widestContent, column.maxWidth);
    }
    return widestContent;
  });

  const divider = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
  const renderRow = (cells: string[]): string => {
    const parts = cells.map((cell, index) => {
      const normalized = truncateCell(cell ?? "", widths[index]);
      return ` ${padRight(normalized, widths[index])} `;
    });
    return `|${parts.join("|")}|`;
  };

  const lines = [divider, renderRow(columns.map((column) => column.header)), divider];
  for (const row of rows) {
    lines.push(renderRow(row));
  }
  lines.push(divider);
  return lines.join("\n");
}

function renderTwoColumnTable(title: string, rows: Array<[string, string]>, widths = { key: 36, value: 100 }): string {
  return `${title}\n${renderAsciiTable(
    [
      { header: "Field", maxWidth: widths.key },
      { header: "Value", maxWidth: widths.value }
    ],
    rows
  )}\n`;
}

export function writeConfigFileSafely(options: {
  filePath: string;
  body: string;
  overwrite: boolean;
  fsOps?: Partial<SafeWriteFsOps>;
}): { ok: true } | { ok: false; message: string } {
  const fsOps: SafeWriteFsOps = {
    openSync: options.fsOps?.openSync ?? openSync,
    writeFileSync: options.fsOps?.writeFileSync ?? writeFileSync,
    closeSync: options.fsOps?.closeSync ?? closeSync
  };
  const baseFlags = fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW;
  const flags = options.overwrite
    ? baseFlags | fsConstants.O_TRUNC
    : baseFlags | fsConstants.O_CREAT | fsConstants.O_EXCL;

  let fd: number | undefined;
  try {
    fd = fsOps.openSync(options.filePath, flags, 0o600);
    fsOps.writeFileSync(fd, options.body, { encoding: "utf8" });
    return { ok: true };
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ELOOP") {
      return { ok: false, message: "Refusing to write config to a symbolic link path." };
    }
    if (code === "EEXIST") {
      return { ok: false, message: "Config file already exists. Use --force to overwrite." };
    }
    if (code === "EINVAL" || code === "ENOTSUP") {
      return { ok: false, message: "Safe no-follow file writes are not supported on this platform." };
    }
    return { ok: false, message: "Unable to write config file safely." };
  } finally {
    if (typeof fd === "number") {
      try {
        fsOps.closeSync(fd);
      } catch {
        // Best effort close.
      }
    }
  }
}

function summarizeIssues(issues: ConfigIssue[]): { ok: boolean; warnings: number; errors: number } {
  const warnings = issues.filter((issue) => issue.level === "warning").length;
  const errors = issues.filter((issue) => issue.level === "error").length;
  return {
    ok: warnings === 0 && errors === 0,
    warnings,
    errors
  };
}

function hasConfigErrors(config: EffectiveConfig): boolean {
  return config.issues.some((issue) => issue.level === "error");
}

function redactedSummary(value: string): string {
  const digest = createHash("sha256").update(value).digest("hex");
  const length = value.length;
  const prefix = value.slice(0, 2);
  const suffix = value.slice(-2);
  return `len=${length} mask=${prefix}***${suffix} sha256=${digest.slice(0, 12)}`;
}

export function buildRowsForNoRequestedRefs(sanitizedIds: string[], unresolvedReasons: Map<string, string>): ResolveRow[] {
  return sanitizedIds.map((id) => ({
    id,
    status: "unresolved",
    output: unresolvedReasons.get(id) === "policy-blocked" || unresolvedReasons.get(id) === "invalid-ref" ? "filtered" : "missing",
    reason: unresolvedReasons.get(id) ?? "sdk-unresolved"
  }));
}

export function buildRowsForResolvedRefs(options: {
  sanitizedIds: string[];
  unresolvedReasons: Map<string, string>;
  requestedRefs: string[];
  refToId: Map<string, string>;
  resolved: Map<string, string>;
  reveal: boolean;
}): ResolveRow[] {
  return options.sanitizedIds.map((id) => {
    if (options.unresolvedReasons.has(id)) {
      return {
        id,
        status: "unresolved",
        output: "filtered",
        reason: options.unresolvedReasons.get(id) ?? "filtered"
      };
    }

    const ref = options.requestedRefs.find((candidateRef) => options.refToId.get(candidateRef) === id);
    if (!ref) {
      return {
        id,
        status: "unresolved",
        output: "filtered",
        reason: "internal-mapping-miss"
      };
    }

    const value = options.resolved.get(ref);
    if (typeof value !== "string") {
      options.unresolvedReasons.set(id, "sdk-unresolved");
      return {
        id,
        status: "unresolved",
        output: "missing",
        reason: "sdk-unresolved"
      };
    }

    return {
      id,
      status: "resolved",
      output: options.reveal ? value : redactedSummary(value),
      reason: "resolved"
    };
  });
}

export function toResolveJsonPayload(rows: ResolveRow[], options: { debug: boolean; reveal: boolean }): {
  debug: boolean;
  reveal: boolean;
  results: Array<{ id: string; status: string; output: string; reason?: string }>;
} {
  return {
    debug: options.debug,
    reveal: options.reveal,
    results: rows.map((row) => ({
      id: row.id,
      status: row.status,
      output: row.output,
      ...(options.debug ? { reason: row.reason } : {})
    }))
  };
}

export function renderResolveTable(rows: ResolveRow[], debug: boolean): string {
  return renderAsciiTable(
    debug
      ? [
          { header: "ID", maxWidth: 56 },
          { header: "Status", maxWidth: 12 },
          { header: "Output", maxWidth: 96 },
          { header: "Reason", maxWidth: 24 }
        ]
      : [
          { header: "ID", maxWidth: 56 },
          { header: "Status", maxWidth: 12 },
          { header: "Output", maxWidth: 96 }
        ],
    debug ? rows.map((row) => [row.id, row.status, row.output, row.reason]) : rows.map((row) => [row.id, row.status, row.output])
  );
}

function printResolveResults(
  streams: CliStreams,
  options: { rows: ResolveRow[]; debug: boolean; reveal: boolean; asJson: boolean }
): void {
  if (options.asJson) {
    printJson(streams.stdout, toResolveJsonPayload(options.rows, { debug: options.debug, reveal: options.reveal }));
    return;
  }

  streams.stdout.write("RESOLVE RESULTS\n");
  streams.stdout.write(`${renderResolveTable(options.rows, options.debug)}\n`);
}

async function readStdinLines(stream: NodeJS.ReadableStream): Promise<string[]> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
  }
  return chunks
    .join("")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function confirmRevealWithPrompt(streams: CliStreams): Promise<boolean> {
  if (!(streams.stdin as NodeJS.ReadStream).isTTY || !(streams.stdout as NodeJS.WriteStream).isTTY) {
    return false;
  }

  const rl = readline.createInterface({
    input: streams.stdin,
    output: streams.stdout
  });

  try {
    const answer = await rl.question("Reveal secret values to output? Type 'yes' to continue: ");
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

async function runDoctor(args: string[], context: CliExecutionContext, runtime: CliRuntime): Promise<ExitResult> {
  const { streams, env } = context;
  const { flags } = parseFlags(args);
  const asJson = hasFlag(flags, "json");
  const tokenPresent = Boolean(env.OP_SERVICE_ACCOUNT_TOKEN?.trim());
  const effective = loadEffectiveConfig({ env });
  const summary = summarizeIssues(effective.issues);

  let sdkStatus: "skipped" | "ok" | "error" = "skipped";
  if (tokenPresent && !hasConfigErrors(effective)) {
    try {
      const createResolver = runtime.createResolver ?? createOnePasswordResolver;
      await createResolver({
        auth: env.OP_SERVICE_ACCOUNT_TOKEN?.trim() ?? "",
        clientName: effective.config.onePasswordClientName,
        clientVersion: effective.config.onePasswordClientVersion
      });
      sdkStatus = "ok";
    } catch {
      sdkStatus = "error";
    }
  }

  const payload = {
    status:
      sdkStatus === "error" ? "runtime-error" : summary.errors > 0 || !tokenPresent ? "misconfigured" : "healthy",
    path: effective.path,
    fileLoaded: effective.file.loaded,
    effectiveConfig: toSerializableConfig(effective.config),
    provenance: toSerializableProvenance(effective),
    validation: {
      warnings: summary.warnings,
      errors: summary.errors,
      issues: effective.issues
    },
    env: {
      opServiceAccountTokenPresent: tokenPresent
    },
    sdkStatus
  };

  if (asJson) {
    printJson(streams.stdout, payload);
  } else {
    streams.stdout.write("DOCTOR REPORT\n\n");
    streams.stdout.write("CONFIGURATION STATUS\n");
    streams.stdout.write(
      `${renderAsciiTable(
        [
          { header: "Field", maxWidth: 28 },
          { header: "Value", maxWidth: 100 }
        ],
        [
          ["Path Source", effective.path.source],
          ["Path", effective.path.path ?? "(unresolved)"],
          ["Exists", effective.path.exists ? "yes" : "no"],
          ["Readable", effective.path.readable ? "yes" : "no"],
          ["Loaded", effective.file.loaded ? "yes" : "no"],
          ["Resolution Reason", effective.path.reason]
        ]
      )}\n\n`
    );
    streams.stdout.write("ENVIRONMENT STATUS\n");
    streams.stdout.write(
      `${renderAsciiTable(
        [
          { header: "Field", maxWidth: 36 },
          { header: "Value", maxWidth: 32 }
        ],
        [
          ["OP_SERVICE_ACCOUNT_TOKEN Present", tokenPresent ? "yes" : "no"],
          ["SDK Status", sdkStatus]
        ]
      )}\n\n`
    );
    streams.stdout.write("EFFECTIVE CONFIGURATION\n");
    const configRows = Object.entries(effective.provenance).map(([key, entry]) => {
      const value = key === "allowedIdRegex" && entry.value instanceof RegExp ? entry.value.source : entry.value;
      return [key, displayValue(value), entry.source, entry.notes.length > 0 ? entry.notes.join(" | ") : "-"];
    });
    streams.stdout.write(
      `${renderAsciiTable(
        [
          { header: "Key", maxWidth: 24 },
          { header: "Effective Value", maxWidth: 50 },
          { header: "Source", maxWidth: 16 },
          { header: "Notes", maxWidth: 72 }
        ],
        configRows
      )}\n`
    );
    streams.stdout.write("\nVALIDATION SUMMARY\n");
    streams.stdout.write(
      `${renderAsciiTable(
        [
          { header: "Warnings", maxWidth: 10 },
          { header: "Errors", maxWidth: 10 }
        ],
        [[String(summary.warnings), String(summary.errors)]]
      )}\n`
    );
    streams.stdout.write("\nVALIDATION ISSUES\n");
    streams.stdout.write(
      `${renderAsciiTable(
        [
          { header: "Level", maxWidth: 8 },
          { header: "Code", maxWidth: 28 },
          { header: "Key", maxWidth: 20 },
          { header: "Message", maxWidth: 96 }
        ],
        effective.issues.length > 0
          ? effective.issues.map((issue) => [
              issue.level.toUpperCase(),
              issue.code,
              issue.key ?? "-",
              issue.message
            ])
          : [["-", "-", "-", "No validation issues."]]
      )}\n`
    );
  }

  if (sdkStatus === "error") {
    return { code: EXIT_POLICY.RUNTIME };
  }
  if (summary.errors > 0 || !tokenPresent) {
    return { code: EXIT_POLICY.ERROR };
  }
  return { code: EXIT_POLICY.OK };
}

function runConfigPath(args: string[], context: CliExecutionContext): ExitResult {
  const { streams, env } = context;
  const { flags } = parseFlags(args);
  const asJson = hasFlag(flags, "json");
  const effective = loadEffectiveConfig({ env });

  const payload = {
    path: effective.path.path,
    source: effective.path.source,
    exists: effective.path.exists,
    readable: effective.path.readable,
    reason: effective.path.reason
  };

  if (asJson) {
    printJson(streams.stdout, payload);
  } else {
    streams.stdout.write(
      renderTwoColumnTable("CONFIG PATH", [
        ["Path", payload.path ?? "(unresolved)"],
        ["Source", payload.source],
        ["Exists", payload.exists ? "yes" : "no"],
        ["Readable", payload.readable ? "yes" : "no"],
        ["Reason", payload.reason]
      ])
    );
  }

  return { code: EXIT_POLICY.OK };
}

function runConfigShow(args: string[], context: CliExecutionContext): ExitResult {
  const { streams, env } = context;
  const { flags } = parseFlags(args);
  const showDefaults = hasFlag(flags, "defaults");
  const showCurrentFile = hasFlag(flags, "current-file");
  const verbose = hasFlag(flags, "verbose");
  const asJson = hasFlag(flags, "json");

  const effective = loadEffectiveConfig({ env });

  if (showCurrentFile) {
    if (!effective.path.path || !effective.path.exists) {
      streams.stderr.write("No config file exists at resolved path.\n");
      return { code: EXIT_POLICY.ERROR };
    }
    if (!effective.path.readable) {
      streams.stderr.write("Resolved config file is not readable.\n");
      return { code: EXIT_POLICY.ERROR };
    }
    const raw = effective.file.rawText ?? readFileSync(effective.path.path, "utf8");
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (asJson) {
        printJson(streams.stdout, parsed);
      } else {
        const entries = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [key, displayValue(value)]);
        streams.stdout.write(
          renderTwoColumnTable("CURRENT CONFIG FILE", entries as Array<[string, string]>, {
            key: 36,
            value: 100
          })
        );
      }
      return { code: EXIT_POLICY.OK };
    } catch {
      streams.stderr.write("Config file is not valid JSON.\n");
      return { code: EXIT_POLICY.ERROR };
    }
  }

  if (showDefaults) {
    if (asJson) {
      printJson(streams.stdout, toSerializableConfig(effective.defaults));
    } else {
      const rows = Object.entries(toSerializableConfig(effective.defaults)).map(([key, value]) => [
        key,
        displayValue(value)
      ]);
      streams.stdout.write(renderTwoColumnTable("DEFAULT CONFIGURATION", rows as Array<[string, string]>));
    }
    return { code: EXIT_POLICY.OK };
  }

  const payload: Record<string, unknown> = {
    config: toSerializableConfig(effective.config)
  };
  if (verbose) {
    payload.provenance = toSerializableProvenance(effective);
    payload.path = effective.path;
    payload.issues = effective.issues;
  }

  if (asJson) {
    printJson(streams.stdout, payload);
  } else {
    const rows = Object.entries(effective.provenance).map(([key, entry]) => {
      const value = key === "allowedIdRegex" && entry.value instanceof RegExp ? entry.value.source : entry.value;
      return [key, displayValue(value), entry.source, entry.notes.length > 0 ? entry.notes.join(" | ") : "-"];
    });
    streams.stdout.write("EFFECTIVE CONFIGURATION\n");
    streams.stdout.write(
      `${renderAsciiTable(
        [
          { header: "Key", maxWidth: 24 },
          { header: "Effective Value", maxWidth: 50 },
          { header: "Source", maxWidth: 16 },
          { header: "Notes", maxWidth: 72 }
        ],
        rows
      )}\n`
    );
    if (verbose) {
      streams.stdout.write("\nCONFIG PATH\n");
      streams.stdout.write(
        `${renderAsciiTable(
          [
            { header: "Field", maxWidth: 30 },
            { header: "Value", maxWidth: 100 }
          ],
          [
            ["Path", effective.path.path ?? "(unresolved)"],
            ["Source", effective.path.source],
            ["Exists", effective.path.exists ? "yes" : "no"],
            ["Readable", effective.path.readable ? "yes" : "no"],
            ["Reason", effective.path.reason]
          ]
        )}\n`
      );
      streams.stdout.write("\nVALIDATION ISSUES\n");
      streams.stdout.write(
        `${renderAsciiTable(
          [
            { header: "Level", maxWidth: 8 },
            { header: "Code", maxWidth: 28 },
            { header: "Key", maxWidth: 20 },
            { header: "Message", maxWidth: 96 }
          ],
          effective.issues.length > 0
            ? effective.issues.map((issue) => [
                issue.level.toUpperCase(),
                issue.code,
                issue.key ?? "-",
                issue.message
              ])
            : [["-", "-", "-", "No validation issues."]]
        )}\n`
      );
    }
  }
  return { code: hasConfigErrors(effective) ? EXIT_POLICY.ERROR : EXIT_POLICY.OK };
}

function runConfigInit(args: string[], context: CliExecutionContext): ExitResult {
  const { streams, env } = context;
  const { flags } = parseFlags(args);
  const doWrite = hasFlag(flags, "write");
  const force = hasFlag(flags, "force");
  const asJson = hasFlag(flags, "json");
  const defaultVaultFromFlag = getStringFlag(flags, "default-vault");

  const effective = loadEffectiveConfig({ env });
  if (!effective.path.path) {
    streams.stderr.write("Unable to resolve config path. Set HOME, XDG_CONFIG_HOME, or OP_RESOLVER_CONFIG.\n");
    return { code: EXIT_POLICY.ERROR };
  }

  const hasExistingConfigDefaultVault =
    effective.file.loaded && effective.provenance.defaultVault.source === "config-file";
  const selectedDefaultVault =
    defaultVaultFromFlag ?? (hasExistingConfigDefaultVault ? effective.config.defaultVault : undefined);

  if (!selectedDefaultVault) {
    streams.stderr.write(
      "defaultVault is required. Pass --default-vault <name>, or keep an existing config file with defaultVault.\n"
    );
    return { code: EXIT_POLICY.ERROR };
  }

  const minimalConfig = {
    defaultVault: selectedDefaultVault,
    vaultPolicy: "default_vault"
  };
  const body = `${JSON.stringify(minimalConfig, null, 2)}\n`;
  const fileExists = existsSync(effective.path.path);

  if (asJson) {
    printJson(streams.stdout, {
      path: effective.path.path,
      wouldWrite: body,
      wrote: doWrite,
      overwritten: doWrite && fileExists,
      dryRun: !doWrite
    });
  } else {
    streams.stdout.write(
      renderTwoColumnTable("CONFIG INITIALIZATION", [
        ["Path", effective.path.path],
        ["Default Vault", selectedDefaultVault],
        ["Default Vault Source", defaultVaultFromFlag ? "flag" : "existing-config"],
        ["Dry Run", !doWrite ? "yes" : "no"],
        ["Write Requested", doWrite ? "yes" : "no"],
        ["Overwrite Requested", force ? "yes" : "no"]
      ])
    );
    if (!doWrite) {
      streams.stdout.write(
        renderTwoColumnTable("MINIMAL CONFIG CONTENT", [
          ["defaultVault", selectedDefaultVault],
          ["vaultPolicy", "default_vault"]
        ])
      );
    }
  }

  if (!doWrite) {
    return { code: EXIT_POLICY.OK };
  }

  if (fileExists && !force) {
    streams.stderr.write("Config file already exists. Use --force to overwrite.\n");
    return { code: EXIT_POLICY.ERROR };
  }

  if (fileExists) {
    try {
      if (lstatSync(effective.path.path).isSymbolicLink()) {
        streams.stderr.write("Refusing to write config to a symbolic link path.\n");
        return { code: EXIT_POLICY.ERROR };
      }
    } catch {
      streams.stderr.write("Unable to stat existing config path.\n");
      return { code: EXIT_POLICY.ERROR };
    }
  }

  const dir = path.dirname(effective.path.path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const writeResult = writeConfigFileSafely({
    filePath: effective.path.path,
    body,
    overwrite: fileExists
  });
  if (!writeResult.ok) {
    streams.stderr.write(`${writeResult.message}\n`);
    return { code: EXIT_POLICY.ERROR };
  }
  try {
    chmodSync(effective.path.path, 0o600);
  } catch {
    // Best effort; keep write successful even if chmod is unsupported.
  }

  if (!asJson) {
    streams.stdout.write(
      renderTwoColumnTable("WRITE RESULT", [
        ["Status", "written"],
        ["Path", effective.path.path]
      ])
    );
  }
  return { code: EXIT_POLICY.OK };
}

function runOpenclawSnippet(args: string[], context: CliExecutionContext): ExitResult {
  const { streams, entryScriptPath, env } = context;
  const { flags } = parseFlags(args);
  const providerAlias = getStringFlag(flags, "provider") ?? DEFAULT_OPENCLAW_PROVIDER_ALIAS;
  const commandOverride = getStringFlag(flags, "command");
  const openclawPathResolution = resolveOpenclawConfigPath({ env });

  const commandHint = commandOverride ?? resolveOpenclawResolverCommandHint(entryScriptPath);

  if (shouldPrintSnippetInstructions(flags, streams)) {
    printSnippetInstructions(streams.stderr, [
      "Paste this JSON into secrets.providers in your OpenClaw config.",
      `Likely OpenClaw config path: ${openclawPathResolution.path ?? "unresolved"}`,
      `Path source: ${openclawPathResolution.source} (${openclawPathResolution.reason})`,
      "Set command explicitly if needed: openclaw-1p-sdk-resolver openclaw snippet --command \"$(command -v openclaw-1p-sdk-resolver)\"",
      "This tool does not edit OpenClaw files."
    ], { trailingBlankLine: true });
  }

  const snippet = buildResolverProviderSnippet({ commandHint, providerAlias });
  printJson(streams.stdout, snippet);

  return { code: EXIT_POLICY.OK };
}

async function analyzeOpenclawSetup(
  args: string[],
  context: CliExecutionContext,
  runtime: CliRuntime
): Promise<{
  payload: {
    status: "clean" | "findings" | "error" | "runtime-error";
    checkMode: boolean;
    path: ReturnType<typeof resolveOpenclawConfigPath>;
    parseError?: string;
    provider: ReturnType<typeof checkOpenclawProviderSetup>;
    resolver: {
      configPath?: string;
      configSource: string;
      tokenPresent: boolean;
      sdkStatus: "skipped" | "ok" | "error";
    };
    issues: Array<{ code: string; message: string; path?: string }>;
    actions: string[];
  };
  exit: ExitCode;
}> {
  const { streams, env } = context;
  const { flags } = parseFlags(args);
  const strictMode = hasFlag(flags, "strict");
  const explicitPath = getStringFlag(flags, "path");
  const providerAlias = getStringFlag(flags, "provider");
  const pathResolution = resolveOpenclawConfigPath({ env, explicitPath });
  const issues: Array<{ code: string; message: string; path?: string }> = [];

  let openclawText: string | undefined;
  if (pathResolution.path && pathResolution.readable) {
    openclawText = readFileSync(pathResolution.path, "utf8");
  } else if (pathResolution.path && pathResolution.exists && !pathResolution.readable) {
    issues.push({
      code: "openclaw_config_unreadable",
      message: "OpenClaw config path exists but is not readable.",
      path: pathResolution.path
    });
  } else if (pathResolution.path && !pathResolution.exists) {
    issues.push({
      code: "openclaw_config_missing",
      message: "OpenClaw config path does not exist.",
      path: pathResolution.path
    });
  }

  const parseResult = openclawText ? parseOpenclawConfigText(openclawText) : { parsed: undefined as unknown };
  const parseError = openclawText ? parseResult.parseError : undefined;
  if (parseError) {
    issues.push({
      code: "openclaw_config_parse_error",
      message: parseError,
      path: pathResolution.path
    });
  }

  const provider = checkOpenclawProviderSetup({
    parsedConfig: parseResult.parsed,
    providerAlias
  });
  for (const finding of provider.findings) {
    issues.push({
      code: finding.code,
      message: finding.message,
      path: finding.path
    });
  }

  const effective = loadEffectiveConfig({ env });
  const tokenPresent = Boolean(env.OP_SERVICE_ACCOUNT_TOKEN?.trim());
  let sdkStatus: "skipped" | "ok" | "error" = "skipped";
  if (tokenPresent && !hasConfigErrors(effective)) {
    try {
      const createResolver = runtime.createResolver ?? createOnePasswordResolver;
      await createResolver({
        auth: env.OP_SERVICE_ACCOUNT_TOKEN?.trim() ?? "",
        clientName: effective.config.onePasswordClientName,
        clientVersion: effective.config.onePasswordClientVersion
      });
      sdkStatus = "ok";
    } catch {
      sdkStatus = "error";
      issues.push({
        code: "one_password_sdk_init_failed",
        message: "Unable to initialize 1Password SDK client."
      });
    }
  } else if (!tokenPresent) {
    issues.push({
      code: "token_missing",
      message: "OP_SERVICE_ACCOUNT_TOKEN is missing."
    });
  }

  const actions = [...provider.suggestions];
  if (!pathResolution.path || !pathResolution.exists) {
    actions.push("Create an OpenClaw config file, then add the provider snippet output.");
  }
  actions.push("Use `openclaw-1p-sdk-resolver openclaw snippet` and paste it under OpenClaw secrets.providers.");
  actions.push("Run `openclaw-1p-sdk-resolver openclaw check --strict` after updating config.");

  const status: "clean" | "findings" | "error" | "runtime-error" =
    sdkStatus === "error"
      ? "runtime-error"
      : issues.some((issue) =>
            issue.code === "openclaw_config_unreadable" || issue.code === "openclaw_config_parse_error"
          )
        ? "error"
        : issues.length > 0
          ? "findings"
          : "clean";

  const exit =
    status === "runtime-error"
      ? EXIT_POLICY.RUNTIME
      : status === "error"
        ? EXIT_POLICY.ERROR
        : status === "findings" && strictMode
          ? EXIT_POLICY.FINDINGS
          : EXIT_POLICY.OK;

  return {
    payload: {
      status,
      checkMode: strictMode,
      path: pathResolution,
      parseError,
      provider,
      resolver: {
        configPath: effective.path.path,
        configSource: effective.path.source,
        tokenPresent,
        sdkStatus
      },
      issues,
      actions
    },
    exit
  };
}

async function runOpenclawCheck(args: string[], context: CliExecutionContext, runtime: CliRuntime): Promise<ExitResult> {
  const { streams, env } = context;
  const { flags } = parseFlags(args);
  const asJson = hasFlag(flags, "json");
  const detailsMode = hasFlag(flags, "details");
  const analysis = await analyzeOpenclawSetup(args, context, runtime);

  if (detailsMode) {
    const effective = loadEffectiveConfig({ env });
    const payload = {
      ...analysis.payload,
      resolverConfig: toSerializableConfig(effective.config),
      resolverProvenance: toSerializableProvenance(effective),
      resolverIssues: effective.issues
    };

    if (asJson) {
      printJson(streams.stdout, payload);
    } else {
      streams.stdout.write("OPENCLAW CHECK\n\n");
      streams.stdout.write("SUMMARY\n");
      streams.stdout.write(`- status: ${payload.status}\n`);
      streams.stdout.write(`- provider found: ${payload.provider.providerFound ? "yes" : "no"}\n`);
      streams.stdout.write(`- OP_SERVICE_ACCOUNT_TOKEN present: ${payload.resolver.tokenPresent ? "yes" : "no"}\n`);
      streams.stdout.write(`- 1Password SDK: ${payload.resolver.sdkStatus}\n\n`);
      streams.stdout.write("OPENCLAW CONFIG PATH\n");
      streams.stdout.write(`- path: ${payload.path.path ?? "(unresolved)"}\n`);
      streams.stdout.write(`- source: ${payload.path.source}\n`);
      streams.stdout.write(`- reason: ${payload.path.reason}\n`);
      streams.stdout.write(
        `- exists/readable: ${payload.path.exists ? "yes" : "no"}/${payload.path.readable ? "yes" : "no"}\n\n`
      );
      streams.stdout.write("PROVIDER FINDINGS\n");
      if (payload.provider.findings.length === 0) {
        streams.stdout.write("- none\n");
      } else {
        for (const finding of payload.provider.findings) {
          streams.stdout.write(`- ${finding.code} at ${finding.path}: ${finding.message}\n`);
        }
      }
      streams.stdout.write("\nRESOLVER CONFIG\n");
      streams.stdout.write(`${JSON.stringify(payload.resolverConfig, null, 2)}\n`);
      streams.stdout.write("\nRESOLVER PROVENANCE\n");
      streams.stdout.write(`${JSON.stringify(payload.resolverProvenance, null, 2)}\n`);
      streams.stdout.write("\nRESOLVER ISSUES\n");
      streams.stdout.write(`${JSON.stringify(payload.resolverIssues, null, 2)}\n`);
    }
    return { code: analysis.exit };
  }

  if (asJson) {
    printJson(streams.stdout, analysis.payload);
  } else {
    streams.stdout.write("OPENCLAW CHECK\n\n");
    streams.stdout.write("SUMMARY\n");
    streams.stdout.write(`- status: ${analysis.payload.status}\n`);
    streams.stdout.write(`- config path: ${analysis.payload.path.path ?? "(unresolved)"}\n`);
    streams.stdout.write(`- provider found: ${analysis.payload.provider.providerFound ? "yes" : "no"}\n`);
    streams.stdout.write(`- OP_SERVICE_ACCOUNT_TOKEN present: ${analysis.payload.resolver.tokenPresent ? "yes" : "no"}\n`);
    streams.stdout.write(`- 1Password SDK: ${analysis.payload.resolver.sdkStatus}\n`);
    streams.stdout.write("\nFINDINGS\n");
    if (analysis.payload.issues.length === 0) {
      streams.stdout.write("- none\n");
    } else {
      for (const issue of analysis.payload.issues) {
        streams.stdout.write(`- ${issue.code}: ${issue.message}\n`);
      }
    }
    streams.stdout.write("\nNEXT ACTIONS\n");
    if (analysis.payload.actions.length === 0) {
      streams.stdout.write("- none\n");
    } else {
      for (const action of analysis.payload.actions.slice(0, 5)) {
        streams.stdout.write(`- ${action}\n`);
      }
    }
  }

  return { code: analysis.exit };
}

function parseProbeTimeoutMs(
  rawValue: string | undefined,
  fallback: number
): { timeoutMs: number; issue?: { code: string; message: string } } {
  if (!rawValue) {
    return { timeoutMs: fallback };
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return {
      timeoutMs: fallback,
      issue: {
        code: "invalid_probe_timeout",
        message: "probe-timeout-ms must be a finite number; default timeout used."
      }
    };
  }
  const rounded = Math.trunc(parsed);
  const clamped = Math.min(120_000, Math.max(1_000, rounded));
  const issue =
    clamped !== rounded
      ? {
          code: "invalid_probe_timeout",
          message: `probe-timeout-ms was clamped to ${clamped}.`
        }
      : undefined;
  return { timeoutMs: clamped, issue };
}

async function analyzeOnePasswordSetup(
  args: string[],
  context: CliExecutionContext,
  runtime: CliRuntime
): Promise<{ payload: OnePasswordCheckPayload; effective: EffectiveConfig; exit: ExitCode }> {
  const { env } = context;
  const { flags } = parseFlags(args);
  const strictMode = hasFlag(flags, "strict");
  const debug = hasFlag(flags, "debug");
  const probeId = getStringFlag(flags, "probe-id");
  const probeTimeout = parseProbeTimeoutMs(getStringFlag(flags, "probe-timeout-ms"), 25_000);
  const effective = loadEffectiveConfig({ env });
  const summary = summarizeIssues(effective.issues);
  const tokenPresent = Boolean(env.OP_SERVICE_ACCOUNT_TOKEN?.trim());
  const issues: Array<{ code: string; message: string; key?: string; level?: string }> = effective.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    key: issue.key,
    level: issue.level
  }));
  if (probeTimeout.issue) {
    issues.push({ code: probeTimeout.issue.code, message: probeTimeout.issue.message, level: "warning" });
  }

  let sdkStatus: "ok" | "skipped" | "error" = "skipped";
  const canAttemptSdk = tokenPresent && !hasConfigErrors(effective);
  const createResolver = runtime.createResolver ?? createOnePasswordResolver;
  let resolverForProbe = runtime.resolver;

  if (canAttemptSdk && !runtime.resolver) {
    try {
      resolverForProbe = await createResolver({
        auth: env.OP_SERVICE_ACCOUNT_TOKEN?.trim() ?? "",
        clientName: effective.config.onePasswordClientName,
        clientVersion: effective.config.onePasswordClientVersion
      });
      sdkStatus = "ok";
    } catch {
      sdkStatus = "error";
      issues.push({
        code: "one_password_sdk_init_failed",
        message: "Unable to initialize 1Password SDK client.",
        level: "error"
      });
    }
  } else if (runtime.resolver) {
    sdkStatus = canAttemptSdk ? "ok" : "skipped";
  } else if (!tokenPresent) {
    issues.push({
      code: "token_missing",
      message: "OP_SERVICE_ACCOUNT_TOKEN is missing.",
      level: "error"
    });
  }

  const probe: OnePasswordProbeResult = {
    requested: Boolean(probeId),
    ...(probeId ? { id: probeId } : {}),
    status: "skipped",
    reason: "not-requested"
  };
  let probeRuntimeFailure = false;

  if (probeId) {
    if (hasConfigErrors(effective)) {
      probe.status = "skipped";
      probe.reason = "config-invalid";
    } else if (!tokenPresent) {
      probe.status = "skipped";
      probe.reason = "token-missing";
    } else if (sdkStatus === "error") {
      probe.status = "skipped";
      probe.reason = "sdk-init-failed";
    } else {
      const sanitized = sanitizeIds([probeId], 1, effective.config.allowedIdRegex);
      if (sanitized.length === 0) {
        probe.status = "filtered";
        probe.reason = "invalid-ref";
      } else {
        const ref = mapIdToReference(sanitized[0], effective.config.defaultVault);
        if (!isValidSecretReference(ref)) {
          probe.status = "filtered";
          probe.reason = "invalid-ref";
        } else {
          const vault = extractVaultFromReference(ref);
          if (!vault) {
            probe.status = "filtered";
            probe.reason = "invalid-ref";
          } else if (
            !isVaultAllowed({
              vault,
              defaultVault: effective.config.defaultVault,
              vaultPolicy: effective.config.vaultPolicy,
              vaultWhitelist: effective.config.vaultWhitelist
            })
          ) {
            probe.status = "filtered";
            probe.reason = "policy-blocked";
          } else {
            try {
              const resolver =
                resolverForProbe ??
                (await createResolver({
                  auth: env.OP_SERVICE_ACCOUNT_TOKEN?.trim() ?? "",
                  clientName: effective.config.onePasswordClientName,
                  clientVersion: effective.config.onePasswordClientVersion
                }));
              const resolved = await resolver.resolveRefs([ref], probeTimeout.timeoutMs, 1);
              const value = resolved.get(ref);
              if (typeof value === "string") {
                probe.status = "resolved";
                probe.reason = "resolved";
              } else {
                probe.status = "unresolved";
                probe.reason = "sdk-unresolved";
              }
            } catch {
              probeRuntimeFailure = true;
              probe.status = "unresolved";
              probe.reason = "probe-runtime-failed";
              issues.push({
                code: "probe_runtime_failed",
                message: "Probe resolution failed at runtime.",
                level: "error"
              });
            }
          }
        }
      }
    }
  }

  const status: "clean" | "findings" | "error" | "runtime-error" =
    sdkStatus === "error" || probeRuntimeFailure
      ? "runtime-error"
      : hasConfigErrors(effective) || !tokenPresent
        ? "error"
        : summary.warnings > 0 || (probe.requested && probe.status !== "resolved")
          ? "findings"
          : "clean";

  const exit =
    status === "runtime-error"
      ? EXIT_POLICY.RUNTIME
      : status === "error"
        ? EXIT_POLICY.ERROR
        : status === "findings" && strictMode
          ? EXIT_POLICY.FINDINGS
          : EXIT_POLICY.OK;

  return {
    payload: {
      status,
      checkMode: strictMode,
      tokenPresent,
      sdkStatus,
      config: {
        path: effective.path,
        valid: !hasConfigErrors(effective),
        errors: summary.errors,
        warnings: summary.warnings
      },
      // Keep probe identifiers out of standard diagnostics output.
      // Raw probe ids are only included when explicit debug mode is requested.
      probe: debug
        ? probe
        : {
            requested: probe.requested,
            status: probe.status,
            reason: probe.reason
          },
      issues
    },
    effective,
    exit
  };
}

async function runOnepasswordCheck(
  args: string[],
  context: CliExecutionContext,
  runtime: CliRuntime
): Promise<ExitResult> {
  const { streams } = context;
  const { flags } = parseFlags(args);
  const asJson = hasFlag(flags, "json");
  const detailsMode = hasFlag(flags, "details");
  const analysis = await analyzeOnePasswordSetup(args, context, runtime);

  if (detailsMode) {
    const provenance = analysis.effective.provenance.allowedIdRegex;
    const allowedIdRegexState: "unset" | "configured" | "fail-closed" =
      provenance?.value instanceof RegExp && provenance.value.source === "$a"
        ? "fail-closed"
        : provenance?.value instanceof RegExp
          ? "configured"
          : "unset";

    const payload: OnePasswordDiagnosePayload = {
      ...analysis.payload,
      resolverConfig: toSerializableConfig(analysis.effective.config),
      resolverProvenance: toSerializableProvenance(analysis.effective),
      resolverIssues: analysis.effective.issues,
      policy: {
        defaultVault: analysis.effective.config.defaultVault,
        vaultPolicy: analysis.effective.config.vaultPolicy,
        vaultWhitelistCount: analysis.effective.config.vaultWhitelist.length,
        allowedIdRegexState
      }
    };

    if (asJson) {
      printJson(streams.stdout, payload);
    } else {
      streams.stdout.write("1PASSWORD CHECK\n\n");
      streams.stdout.write("SUMMARY\n");
      streams.stdout.write(`- status: ${payload.status}\n`);
      streams.stdout.write(`- OP_SERVICE_ACCOUNT_TOKEN present: ${payload.tokenPresent ? "yes" : "no"}\n`);
      streams.stdout.write(`- 1Password SDK: ${payload.sdkStatus}\n`);
      streams.stdout.write(
        `- probe: ${payload.probe.requested ? `${payload.probe.status} (${payload.probe.reason})` : "not requested"}\n`
      );
      streams.stdout.write("\nPOLICY\n");
      streams.stdout.write(`- defaultVault: ${payload.policy.defaultVault}\n`);
      streams.stdout.write(`- vaultPolicy: ${payload.policy.vaultPolicy}\n`);
      streams.stdout.write(`- vaultWhitelistCount: ${payload.policy.vaultWhitelistCount}\n`);
      streams.stdout.write(`- allowedIdRegexState: ${payload.policy.allowedIdRegexState}\n`);
      streams.stdout.write("\nRESOLVER CONFIG\n");
      streams.stdout.write(`${JSON.stringify(payload.resolverConfig, null, 2)}\n`);
      streams.stdout.write("\nRESOLVER PROVENANCE\n");
      streams.stdout.write(`${JSON.stringify(payload.resolverProvenance, null, 2)}\n`);
      streams.stdout.write("\nRESOLVER ISSUES\n");
      streams.stdout.write(`${JSON.stringify(payload.resolverIssues, null, 2)}\n`);
    }
    return { code: analysis.exit };
  }

  if (asJson) {
    printJson(streams.stdout, analysis.payload);
  } else {
    streams.stdout.write("1PASSWORD CHECK\n\n");
    streams.stdout.write("SUMMARY\n");
    streams.stdout.write(`- status: ${analysis.payload.status}\n`);
    streams.stdout.write(`- config valid: ${analysis.payload.config.valid ? "yes" : "no"}\n`);
    streams.stdout.write(`- OP_SERVICE_ACCOUNT_TOKEN present: ${analysis.payload.tokenPresent ? "yes" : "no"}\n`);
    streams.stdout.write(`- 1Password SDK: ${analysis.payload.sdkStatus}\n`);
    if (analysis.payload.probe.requested) {
      streams.stdout.write(`- probe status: ${analysis.payload.probe.status}\n`);
      streams.stdout.write(`- probe reason: ${analysis.payload.probe.reason}\n`);
    }
    streams.stdout.write("\nFINDINGS\n");
    if (analysis.payload.issues.length === 0) {
      streams.stdout.write("- none\n");
    } else {
      for (const issue of analysis.payload.issues) {
        streams.stdout.write(`- ${issue.code}: ${issue.message}\n`);
      }
    }
    streams.stdout.write("\nNEXT ACTIONS\n");
    if (!analysis.payload.tokenPresent) {
      streams.stdout.write("- Export OP_SERVICE_ACCOUNT_TOKEN in your shell or provider passEnv.\n");
    }
    if (!analysis.payload.config.valid) {
      streams.stdout.write("- Run `openclaw-1p-sdk-resolver doctor --json` to inspect config validation errors.\n");
    }
    if (analysis.payload.probe.requested && analysis.payload.probe.status !== "resolved") {
      streams.stdout.write("- Retry probe with a known-good id/ref in an allowed vault.\n");
    }
    if (analysis.payload.issues.length === 0) {
      streams.stdout.write("- none\n");
    }
  }

  return { code: analysis.exit };
}

function runOnepasswordSnippet(args: string[], context: CliExecutionContext): ExitResult {
  const { streams, env } = context;
  const { flags } = parseFlags(args);
  const includeFull = hasFlag(flags, "full");
  const defaultVaultFromFlag = getStringFlag(flags, "default-vault");
  const effective = loadEffectiveConfig({ env });
  const hasExistingConfigDefaultVault =
    effective.file.loaded && effective.provenance.defaultVault.source === "config-file";
  const selectedDefaultVault =
    defaultVaultFromFlag ?? (hasExistingConfigDefaultVault ? effective.config.defaultVault : undefined);

  if (!selectedDefaultVault) {
    streams.stderr.write(
      "defaultVault is required. Pass --default-vault <name>, or keep an existing config file with defaultVault.\n"
    );
    return { code: EXIT_POLICY.ERROR };
  }

  const snippet = includeFull
    ? {
        ...toSerializableConfig(effective.config),
        defaultVault: selectedDefaultVault
      }
    : {
        defaultVault: selectedDefaultVault,
        vaultPolicy: "default_vault"
      };
  if (shouldPrintSnippetInstructions(flags, streams)) {
    printSnippetInstructions(streams.stderr, [
      "Save this JSON as resolver config (.../openclaw-1p-sdk-resolver/config.json) if needed.",
      "No tokens or secret values are included."
    ]);
  }
  printJson(streams.stdout, snippet);
  return { code: EXIT_POLICY.OK };
}

async function runResolve(args: string[], context: CliExecutionContext, runtime: CliRuntime): Promise<ExitResult> {
  const { streams, env } = context;
  const { flags } = parseFlags(args);
  const idsFromFlag = flags.get("id") ?? [];
  const fromStdin = hasFlag(flags, "stdin");
  const asJson = hasFlag(flags, "json");
  const debug = hasFlag(flags, "debug");
  const reveal = hasFlag(flags, "reveal");
  const yes = hasFlag(flags, "yes");

  const effective = loadEffectiveConfig({ env });
  if (hasConfigErrors(effective)) {
    streams.stderr.write("Configuration is invalid. Run 'doctor' for details.\n");
    return { code: EXIT_POLICY.ERROR };
  }

  if (!env.OP_SERVICE_ACCOUNT_TOKEN?.trim()) {
    streams.stderr.write("OP_SERVICE_ACCOUNT_TOKEN is required for resolve.\n");
    return { code: EXIT_POLICY.ERROR };
  }

  if (reveal && !yes) {
    const confirmed = runtime.confirmReveal
      ? await runtime.confirmReveal()
      : await confirmRevealWithPrompt(streams);

    if (!confirmed) {
      streams.stderr.write("Reveal was not confirmed. Re-run with --yes to force non-interactive reveal.\n");
      return { code: EXIT_POLICY.ERROR };
    }
  }

  const stdinIds = fromStdin ? await readStdinLines(streams.stdin) : [];
  const combinedIds = [...idsFromFlag, ...stdinIds];
  const sanitizedIds = sanitizeIds(combinedIds, effective.config.maxIds, effective.config.allowedIdRegex);

  if (sanitizedIds.length === 0) {
    streams.stderr.write("No valid ids to resolve.\n");
    return { code: EXIT_POLICY.FINDINGS };
  }

  const refToId = new Map<string, string>();
  const requestedRefs: string[] = [];
  const unresolvedReasons = new Map<string, string>();

  for (const id of sanitizedIds) {
    const ref = mapIdToReference(id, effective.config.defaultVault);
    if (!isValidSecretReference(ref)) {
      unresolvedReasons.set(id, "invalid-ref");
      continue;
    }
    const vault = extractVaultFromReference(ref);
    if (!vault) {
      unresolvedReasons.set(id, "invalid-ref");
      continue;
    }
    if (
      !isVaultAllowed({
        vault,
        defaultVault: effective.config.defaultVault,
        vaultPolicy: effective.config.vaultPolicy,
        vaultWhitelist: effective.config.vaultWhitelist
      })
    ) {
      unresolvedReasons.set(id, "policy-blocked");
      continue;
    }

    refToId.set(ref, id);
    requestedRefs.push(ref);
  }

  if (requestedRefs.length === 0) {
    const rows = buildRowsForNoRequestedRefs(sanitizedIds, unresolvedReasons);
    printResolveResults(streams, { rows, debug, reveal, asJson });

    return { code: EXIT_POLICY.FINDINGS };
  }

  try {
    const resolver =
      runtime.resolver ??
      (await (runtime.createResolver ?? createOnePasswordResolver)({
        auth: env.OP_SERVICE_ACCOUNT_TOKEN.trim(),
        clientName: effective.config.onePasswordClientName,
        clientVersion: effective.config.onePasswordClientVersion
      }));

    const resolved = await resolver.resolveRefs(
      requestedRefs,
      effective.config.timeoutMs,
      effective.config.concurrency
    );

    const rows = buildRowsForResolvedRefs({
      sanitizedIds,
      unresolvedReasons,
      requestedRefs,
      refToId,
      resolved,
      reveal
    });
    printResolveResults(streams, { rows, debug, reveal, asJson });

    return {
      code: rows.every((row) => row.status === "resolved") ? EXIT_POLICY.OK : EXIT_POLICY.FINDINGS
    };
  } catch {
    streams.stderr.write("Resolver runtime failed.\n");
    return { code: EXIT_POLICY.RUNTIME };
  }
}

export async function runCli(argv: string[], runtime: CliRuntime): Promise<number> {
  const context = normalizeExecutionContext(runtime);
  const { streams } = context;
  const command = argv[0];

  if (!command) {
    await runtime.runResolver({
      env: context.env,
      stdin: context.streams.stdin,
      stdout: context.streams.stdout,
      resolver: runtime.resolver
    });
    return EXIT_POLICY.OK;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printUsage(streams.stdout);
    return EXIT_POLICY.OK;
  }

  if (command === "doctor") {
    const result = await runDoctor(argv.slice(1), context, runtime);
    return result.code;
  }

  if (command === "config") {
    const subcommand = argv[1];
    if (subcommand === "path") {
      return runConfigPath(argv.slice(2), context).code;
    }
    if (subcommand === "show") {
      return runConfigShow(argv.slice(2), context).code;
    }
    if (subcommand === "init") {
      return runConfigInit(argv.slice(2), context).code;
    }
    streams.stderr.write("Unknown config subcommand. Use: path | show | init\n");
    return EXIT_POLICY.ERROR;
  }

  if (command === "openclaw") {
    const subcommand = argv[1];
    if (subcommand === "snippet") {
      return runOpenclawSnippet(argv.slice(2), context).code;
    }
    if (subcommand === "check") {
      return (await runOpenclawCheck(argv.slice(2), context, runtime)).code;
    }
    streams.stderr.write("Unknown openclaw subcommand. Use: check | snippet\n");
    return EXIT_POLICY.ERROR;
  }

  if (command === "1password" || command === "1p") {
    const subcommand = argv[1];
    if (subcommand === "check") {
      return (await runOnepasswordCheck(argv.slice(2), context, runtime)).code;
    }
    if (subcommand === "snippet") {
      return runOnepasswordSnippet(argv.slice(2), context).code;
    }
    streams.stderr.write("Unknown 1password subcommand. Use: check | snippet\n");
    return EXIT_POLICY.ERROR;
  }

  if (command === "resolve") {
    const result = await runResolve(argv.slice(1), context, runtime);
    return result.code;
  }

  streams.stderr.write(`Unknown command: ${command}\n`);
  printUsage(streams.stderr);
  return EXIT_POLICY.ERROR;
}

export async function ensureRevealAllowed(options: {
  reveal: boolean;
  yes: boolean;
  streams: CliStreams;
  confirm?: () => Promise<boolean>;
}): Promise<boolean> {
  if (!options.reveal) {
    return true;
  }
  if (options.yes) {
    return true;
  }
  if (options.confirm) {
    return options.confirm();
  }
  if (!(options.streams.stdin as NodeJS.ReadStream).isTTY) {
    return false;
  }
  if (!(options.streams.stdout as NodeJS.WriteStream).isTTY) {
    return false;
  }
  return confirmRevealWithPrompt(options.streams);
}

export function canReadPath(filePath: string): boolean {
  try {
    accessSync(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}
