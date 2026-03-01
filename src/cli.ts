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
import { createOnePasswordResolver, isValidSecretReference, type SecretResolver } from "./onepassword.js";
import {
  collectOpenclawReferences,
  parseOpenclawConfigText,
  resolveOpenclawConfigPath,
  scanRepositoryForSecretCandidates,
  suggestOpenclawProviderImprovements
} from "./openclaw.js";
import { loadEffectiveConfig, type ConfigIssue, type EffectiveConfig } from "./protocol.js";
import { extractVaultFromReference, isVaultAllowed, mapIdToReference, sanitizeIds } from "./sanitize.js";

type CliStreams = {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
};

type CliRuntime = {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
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
  code: number;
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

function printUsage(stream: NodeJS.WritableStream): void {
  stream.write(`openclaw-1p-sdk-resolver\n\n`);
  stream.write(`Usage:\n`);
  stream.write(`  openclaw-1p-sdk-resolver                    # resolver mode (stdin protocol)\n`);
  stream.write(`  openclaw-1p-sdk-resolver doctor [--json]\n`);
  stream.write(`  openclaw-1p-sdk-resolver config path [--json]\n`);
  stream.write(`  openclaw-1p-sdk-resolver config show [--json] [--defaults] [--current-file] [--verbose]\n`);
  stream.write(`  openclaw-1p-sdk-resolver config init [--default-vault <name>] [--write] [--force] [--json]\n`);
  stream.write(`  openclaw-1p-sdk-resolver openclaw snippet [--json]\n`);
  stream.write(`  openclaw-1p-sdk-resolver openclaw audit [scan|suggest] [--path <openclaw.json>] [--repo <dir>] [--json]\n`);
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

async function runDoctor(args: string[], runtime: CliRuntime): Promise<ExitResult> {
  const streams = normalizeStreams(runtime);
  const env = runtime.env ?? process.env;
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
    return { code: 3 };
  }
  if (summary.errors > 0 || !tokenPresent) {
    return { code: 2 };
  }
  return { code: 0 };
}

function runConfigPath(args: string[], runtime: CliRuntime): ExitResult {
  const streams = normalizeStreams(runtime);
  const env = runtime.env ?? process.env;
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

  return { code: 0 };
}

function runConfigShow(args: string[], runtime: CliRuntime): ExitResult {
  const streams = normalizeStreams(runtime);
  const env = runtime.env ?? process.env;
  const { flags } = parseFlags(args);
  const showDefaults = hasFlag(flags, "defaults");
  const showCurrentFile = hasFlag(flags, "current-file");
  const verbose = hasFlag(flags, "verbose");
  const asJson = hasFlag(flags, "json");

  const effective = loadEffectiveConfig({ env });

  if (showCurrentFile) {
    if (!effective.path.path || !effective.path.exists) {
      streams.stderr.write("No config file exists at resolved path.\n");
      return { code: 2 };
    }
    if (!effective.path.readable) {
      streams.stderr.write("Resolved config file is not readable.\n");
      return { code: 2 };
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
      return { code: 0 };
    } catch {
      streams.stderr.write("Config file is not valid JSON.\n");
      return { code: 2 };
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
    return { code: 0 };
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
  return { code: hasConfigErrors(effective) ? 2 : 0 };
}

function runConfigInit(args: string[], runtime: CliRuntime): ExitResult {
  const streams = normalizeStreams(runtime);
  const env = runtime.env ?? process.env;
  const { flags } = parseFlags(args);
  const doWrite = hasFlag(flags, "write");
  const force = hasFlag(flags, "force");
  const asJson = hasFlag(flags, "json");
  const defaultVaultFromFlag = getStringFlag(flags, "default-vault");

  const effective = loadEffectiveConfig({ env });
  if (!effective.path.path) {
    streams.stderr.write("Unable to resolve config path. Set HOME, XDG_CONFIG_HOME, or OP_RESOLVER_CONFIG.\n");
    return { code: 2 };
  }

  const hasExistingConfigDefaultVault =
    effective.file.loaded && effective.provenance.defaultVault.source === "config-file";
  const selectedDefaultVault =
    defaultVaultFromFlag ?? (hasExistingConfigDefaultVault ? effective.config.defaultVault : undefined);

  if (!selectedDefaultVault) {
    streams.stderr.write(
      "defaultVault is required. Pass --default-vault <name>, or keep an existing config file with defaultVault.\n"
    );
    return { code: 2 };
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
    return { code: 0 };
  }

  if (fileExists && !force) {
    streams.stderr.write("Config file already exists. Use --force to overwrite.\n");
    return { code: 2 };
  }

  if (fileExists) {
    try {
      if (lstatSync(effective.path.path).isSymbolicLink()) {
        streams.stderr.write("Refusing to write config to a symbolic link path.\n");
        return { code: 2 };
      }
    } catch {
      streams.stderr.write("Unable to stat existing config path.\n");
      return { code: 2 };
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
    return { code: 2 };
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
  return { code: 0 };
}

function runOpenclawSnippet(args: string[], runtime: CliRuntime): ExitResult {
  const streams = normalizeStreams(runtime);
  const { flags } = parseFlags(args);
  const asJson = hasFlag(flags, "json");

  const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
  const commandHint =
    path.basename(invokedPath) === "openclaw-1p-sdk-resolver"
      ? invokedPath
      : "/absolute/path/to/openclaw-1p-sdk-resolver";

  const snippet = {
    providers: [
      {
        name: "onepassword",
        kind: "exec",
        config: {
          jsonOnly: true,
          command: commandHint,
          passEnv: ["HOME", "OP_SERVICE_ACCOUNT_TOKEN", "OP_RESOLVER_CONFIG"],
          trustedDirs: ["$HOME/.local/bin", "$HOME/bin"]
        }
      }
    ]
  };

  if (asJson) {
    printJson(streams.stdout, snippet);
  } else {
    streams.stdout.write(
      renderTwoColumnTable("OPENCLAW PROVIDER SNIPPET", [
        ["Provider Name", "onepassword"],
        ["Kind", "exec"],
        ["jsonOnly", "true"],
        ["Command", commandHint],
        ["passEnv", "HOME, OP_SERVICE_ACCOUNT_TOKEN, OP_RESOLVER_CONFIG"],
        ["trustedDirs", "$HOME/.local/bin, $HOME/bin"]
      ])
    );
  }

  return { code: 0 };
}

function runOpenclawAudit(args: string[], runtime: CliRuntime): ExitResult {
  const streams = normalizeStreams(runtime);
  const env = runtime.env ?? process.env;
  const cwd = runtime.cwd ?? process.cwd();
  const { flags, positionals } = parseFlags(args);
  const asJson = hasFlag(flags, "json");
  const auditMode = positionals[0] ?? "scan";
  if (auditMode !== "scan" && auditMode !== "suggest") {
    streams.stderr.write("Unknown audit mode. Use: scan | suggest\n");
    return { code: 2 };
  }

  const explicitPath = getStringFlag(flags, "path");
  const repoRoot = getStringFlag(flags, "repo") ?? cwd;
  const pathResolution = resolveOpenclawConfigPath({ env, explicitPath });
  const openclawText =
    pathResolution.path && pathResolution.readable ? readFileSync(pathResolution.path, "utf8") : undefined;
  const references = openclawText ? collectOpenclawReferences(openclawText) : [];
  const parseResult = openclawText ? parseOpenclawConfigText(openclawText) : { parsed: undefined as unknown };
  const parseError = openclawText ? parseResult.parseError : undefined;

  const findings = auditMode === "scan" ? scanRepositoryForSecretCandidates({ rootDir: repoRoot }) : [];
  const suggestions = suggestOpenclawProviderImprovements({ openclawText, references });

  const payload = {
    mode: auditMode,
    configPath: pathResolution,
    parseError,
    summary: {
      referencesFound: references.length,
      candidateSecrets: findings.filter((finding) => finding.type === "candidate_for_1password").length,
      riskyLiterals: findings.filter((finding) => finding.type === "risky_literal").length
    },
    findings,
    suggestions
  };

  if (asJson) {
    printJson(streams.stdout, payload);
  } else {
    streams.stdout.write("OPENCLAW AUDIT\n\n");
    streams.stdout.write(
      renderTwoColumnTable("OPENCLAW CONFIGURATION", [
        ["Path", pathResolution.path ?? "(unresolved)"],
        ["Source", pathResolution.source],
        ["Exists", pathResolution.exists ? "yes" : "no"],
        ["Readable", pathResolution.readable ? "yes" : "no"],
        ["Reason", pathResolution.reason],
        ["Parse", parseError ? "invalid-json" : openclawText ? "ok" : "not-loaded"]
      ])
    );
    streams.stdout.write(
      renderTwoColumnTable("SUMMARY", [
        ["OpenClaw refs found", String(references.length)],
        ["Candidate secrets", String(payload.summary.candidateSecrets)],
        ["Risky literals", String(payload.summary.riskyLiterals)]
      ])
    );
    if (auditMode === "scan") {
      streams.stdout.write("FINDINGS\n");
      const rows =
        findings.length > 0
          ? findings.map((finding) => [finding.type, finding.file, String(finding.line), finding.key, finding.fingerprint])
          : [["-", "-", "-", "-", "No findings."]];
      streams.stdout.write(
        `${renderAsciiTable(
          [
            { header: "Type", maxWidth: 24 },
            { header: "File", maxWidth: 68 },
            { header: "Line", maxWidth: 8 },
            { header: "Key", maxWidth: 28 },
            { header: "Fingerprint", maxWidth: 28 }
          ],
          rows
        )}\n\n`
      );
    }
    streams.stdout.write("SUGGESTIONS\n");
    const suggestionRows = suggestions.length > 0 ? suggestions.map((suggestion, index) => [String(index + 1), suggestion]) : [["1", "No suggestions."]];
    streams.stdout.write(
      `${renderAsciiTable(
        [
          { header: "#", maxWidth: 4 },
          { header: "Suggestion", maxWidth: 120 }
        ],
        suggestionRows
      )}\n`
    );
  }

  if (pathResolution.exists && !pathResolution.readable) {
    return { code: 2 };
  }
  return { code: 0 };
}

async function runResolve(args: string[], runtime: CliRuntime): Promise<ExitResult> {
  const streams = normalizeStreams(runtime);
  const env = runtime.env ?? process.env;
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
    return { code: 2 };
  }

  if (!env.OP_SERVICE_ACCOUNT_TOKEN?.trim()) {
    streams.stderr.write("OP_SERVICE_ACCOUNT_TOKEN is required for resolve.\n");
    return { code: 2 };
  }

  if (reveal && !yes) {
    const confirmed = runtime.confirmReveal
      ? await runtime.confirmReveal()
      : await confirmRevealWithPrompt(streams);

    if (!confirmed) {
      streams.stderr.write("Reveal was not confirmed. Re-run with --yes to force non-interactive reveal.\n");
      return { code: 2 };
    }
  }

  const stdinIds = fromStdin ? await readStdinLines(streams.stdin) : [];
  const combinedIds = [...idsFromFlag, ...stdinIds];
  const sanitizedIds = sanitizeIds(combinedIds, effective.config.maxIds, effective.config.allowedIdRegex);

  if (sanitizedIds.length === 0) {
    streams.stderr.write("No valid ids to resolve.\n");
    return { code: 1 };
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

    return { code: 1 };
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
      code: rows.every((row) => row.status === "resolved") ? 0 : 1
    };
  } catch {
    streams.stderr.write("Resolver runtime failed.\n");
    return { code: 3 };
  }
}

export async function runCli(argv: string[], runtime: CliRuntime): Promise<number> {
  const streams = normalizeStreams(runtime);
  const command = argv[0];

  if (!command) {
    await runtime.runResolver({
      env: runtime.env,
      stdin: streams.stdin,
      stdout: streams.stdout,
      resolver: runtime.resolver
    });
    return 0;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    printUsage(streams.stdout);
    return 0;
  }

  if (command === "doctor") {
    const result = await runDoctor(argv.slice(1), runtime);
    return result.code;
  }

  if (command === "config") {
    const subcommand = argv[1];
    if (subcommand === "path") {
      return runConfigPath(argv.slice(2), runtime).code;
    }
    if (subcommand === "show") {
      return runConfigShow(argv.slice(2), runtime).code;
    }
    if (subcommand === "init") {
      return runConfigInit(argv.slice(2), runtime).code;
    }
    streams.stderr.write("Unknown config subcommand. Use: path | show | init\n");
    return 2;
  }

  if (command === "openclaw") {
    const subcommand = argv[1];
    if (subcommand === "snippet") {
      return runOpenclawSnippet(argv.slice(2), runtime).code;
    }
    if (subcommand === "audit") {
      return runOpenclawAudit(argv.slice(2), runtime).code;
    }
    streams.stderr.write("Unknown openclaw subcommand. Use: snippet | audit\n");
    return 2;
  }

  if (command === "resolve") {
    const result = await runResolve(argv.slice(1), runtime);
    return result.code;
  }

  streams.stderr.write(`Unknown command: ${command}\n`);
  printUsage(streams.stderr);
  return 2;
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
