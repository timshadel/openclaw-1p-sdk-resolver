import { createHash } from "node:crypto";
import { accessSync, chmodSync, constants as fsConstants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stdin as processStdin, stdout as processStdout, stderr as processStderr } from "node:process";
import readline from "node:readline/promises";
import { createOnePasswordResolver, isValidSecretReference } from "./onepassword.js";
import { loadEffectiveConfig } from "./protocol.js";
import { extractVaultFromReference, isVaultAllowed, mapIdToReference, sanitizeIds } from "./sanitize.js";
function normalizeStreams(runtime) {
    return {
        stdin: runtime.streams?.stdin ?? processStdin,
        stdout: runtime.streams?.stdout ?? processStdout,
        stderr: runtime.streams?.stderr ?? processStderr
    };
}
function isTruthyFlag(value) {
    return value === "true" || value === "1" || value === "yes";
}
function parseFlags(args) {
    const positionals = [];
    const flags = new Map();
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
function getLastFlag(flags, name) {
    const values = flags.get(name);
    if (!values || values.length === 0) {
        return undefined;
    }
    return values[values.length - 1];
}
function hasFlag(flags, name) {
    return flags.has(name) && isTruthyFlag(getLastFlag(flags, name));
}
function toSerializableConfig(config) {
    return {
        ...config,
        allowedIdRegex: config.allowedIdRegex ? config.allowedIdRegex.source : undefined
    };
}
function toSerializableProvenance(config) {
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
function printJson(stream, value) {
    stream.write(`${JSON.stringify(value, null, 2)}\n`);
}
function printUsage(stream) {
    stream.write(`openclaw-1p-sdk-resolver\n\n`);
    stream.write(`Usage:\n`);
    stream.write(`  openclaw-1p-sdk-resolver                    # resolver mode (stdin protocol)\n`);
    stream.write(`  openclaw-1p-sdk-resolver doctor [--json]\n`);
    stream.write(`  openclaw-1p-sdk-resolver config path [--json]\n`);
    stream.write(`  openclaw-1p-sdk-resolver config show [--defaults] [--current-file] [--verbose]\n`);
    stream.write(`  openclaw-1p-sdk-resolver config init [--write] [--force] [--json]\n`);
    stream.write(`  openclaw-1p-sdk-resolver openclaw snippet [--json]\n`);
    stream.write(`  openclaw-1p-sdk-resolver resolve --id <id> [--id <id>] [--stdin] [--json] [--reveal --yes]\n`);
}
function summarizeIssues(issues) {
    const warnings = issues.filter((issue) => issue.level === "warning").length;
    const errors = issues.filter((issue) => issue.level === "error").length;
    return {
        ok: warnings === 0 && errors === 0,
        warnings,
        errors
    };
}
function hasConfigErrors(config) {
    return config.issues.some((issue) => issue.level === "error");
}
function redactedSummary(value) {
    const digest = createHash("sha256").update(value).digest("hex");
    const length = value.length;
    const prefix = value.slice(0, 2);
    const suffix = value.slice(-2);
    return `len=${length} mask=${prefix}***${suffix} sha256=${digest.slice(0, 12)}`;
}
async function readStdinLines(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    }
    return chunks
        .join("")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}
async function confirmRevealWithPrompt(streams) {
    if (!streams.stdin.isTTY || !streams.stdout.isTTY) {
        return false;
    }
    const rl = readline.createInterface({
        input: streams.stdin,
        output: streams.stdout
    });
    try {
        const answer = await rl.question("Reveal secret values to output? Type 'yes' to continue: ");
        return answer.trim().toLowerCase() === "yes";
    }
    finally {
        rl.close();
    }
}
async function runDoctor(args, runtime) {
    const streams = normalizeStreams(runtime);
    const env = runtime.env ?? process.env;
    const { flags } = parseFlags(args);
    const asJson = hasFlag(flags, "json");
    const tokenPresent = Boolean(env.OP_SERVICE_ACCOUNT_TOKEN?.trim());
    const effective = loadEffectiveConfig({ env });
    const summary = summarizeIssues(effective.issues);
    let sdkStatus = "skipped";
    if (tokenPresent && !hasConfigErrors(effective)) {
        try {
            const createResolver = runtime.createResolver ?? createOnePasswordResolver;
            await createResolver({
                auth: env.OP_SERVICE_ACCOUNT_TOKEN?.trim() ?? "",
                integrationName: effective.config.integrationName,
                integrationVersion: effective.config.integrationVersion
            });
            sdkStatus = "ok";
        }
        catch {
            sdkStatus = "error";
        }
    }
    const payload = {
        status: sdkStatus === "error" ? "runtime-error" : summary.errors > 0 || !tokenPresent ? "misconfigured" : "healthy",
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
    }
    else {
        streams.stdout.write("Doctor Report\n");
        streams.stdout.write(`Config path source: ${effective.path.source}\n`);
        streams.stdout.write(`Config path: ${effective.path.path ?? "(unresolved)"}\n`);
        streams.stdout.write(`Config exists/readable: ${effective.path.exists ? "yes" : "no"}/${effective.path.readable ? "yes" : "no"}\n`);
        streams.stdout.write(`Config loaded: ${effective.file.loaded ? "yes" : "no"}\n`);
        streams.stdout.write(`Token present: ${tokenPresent ? "yes" : "no"}\n`);
        streams.stdout.write(`SDK status: ${sdkStatus}\n\n`);
        streams.stdout.write("Effective config\n");
        streams.stdout.write("key\tvalue\tsource\tnotes\n");
        for (const [key, entry] of Object.entries(effective.provenance)) {
            const value = key === "allowedIdRegex" && entry.value instanceof RegExp ? entry.value.source : entry.value;
            streams.stdout.write(`${key}\t${JSON.stringify(value)}\t${entry.source}\t${entry.notes.join(" | ")}\n`);
        }
        streams.stdout.write("\nValidation\n");
        streams.stdout.write(`warnings=${summary.warnings} errors=${summary.errors}\n`);
        for (const issue of effective.issues) {
            streams.stdout.write(`- ${issue.level.toUpperCase()} ${issue.code}: ${issue.message}\n`);
        }
    }
    if (sdkStatus === "error") {
        return { code: 3 };
    }
    if (summary.errors > 0 || !tokenPresent) {
        return { code: 2 };
    }
    return { code: 0 };
}
function runConfigPath(args, runtime) {
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
    }
    else {
        streams.stdout.write(`${payload.path ?? "(unresolved)"}\n`);
        streams.stdout.write(`source=${payload.source} exists=${payload.exists ? "yes" : "no"} readable=${payload.readable ? "yes" : "no"}\n`);
        streams.stdout.write(`${payload.reason}\n`);
    }
    return { code: 0 };
}
function runConfigShow(args, runtime) {
    const streams = normalizeStreams(runtime);
    const env = runtime.env ?? process.env;
    const { flags } = parseFlags(args);
    const showDefaults = hasFlag(flags, "defaults");
    const showCurrentFile = hasFlag(flags, "current-file");
    const verbose = hasFlag(flags, "verbose");
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
            const parsed = JSON.parse(raw);
            printJson(streams.stdout, parsed);
            return { code: 0 };
        }
        catch {
            streams.stderr.write("Config file is not valid JSON.\n");
            return { code: 2 };
        }
    }
    if (showDefaults) {
        printJson(streams.stdout, toSerializableConfig(effective.defaults));
        return { code: 0 };
    }
    const payload = {
        config: toSerializableConfig(effective.config)
    };
    if (verbose) {
        payload.provenance = toSerializableProvenance(effective);
        payload.path = effective.path;
        payload.issues = effective.issues;
    }
    printJson(streams.stdout, payload);
    return { code: hasConfigErrors(effective) ? 2 : 0 };
}
function runConfigInit(args, runtime) {
    const streams = normalizeStreams(runtime);
    const env = runtime.env ?? process.env;
    const { flags } = parseFlags(args);
    const doWrite = hasFlag(flags, "write");
    const force = hasFlag(flags, "force");
    const asJson = hasFlag(flags, "json");
    const effective = loadEffectiveConfig({ env });
    if (!effective.path.path) {
        streams.stderr.write("Unable to resolve config path. Set HOME, XDG_CONFIG_HOME, or OP_RESOLVER_CONFIG.\n");
        return { code: 2 };
    }
    const minimalConfig = {
        defaultVault: "default",
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
    }
    else {
        streams.stdout.write(`Path: ${effective.path.path}\n`);
        if (!doWrite) {
            streams.stdout.write("Dry-run; pass --write to persist.\n");
            streams.stdout.write(body);
        }
    }
    if (!doWrite) {
        return { code: 0 };
    }
    if (fileExists && !force) {
        streams.stderr.write("Config file already exists. Use --force to overwrite.\n");
        return { code: 2 };
    }
    const dir = path.dirname(effective.path.path);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(effective.path.path, body, { encoding: "utf8", mode: 0o600 });
    try {
        chmodSync(effective.path.path, 0o600);
    }
    catch {
        // Best effort; keep write successful even if chmod is unsupported.
    }
    if (!asJson) {
        streams.stdout.write("Config written.\n");
    }
    return { code: 0 };
}
function runOpenclawSnippet(args, runtime) {
    const streams = normalizeStreams(runtime);
    const { flags } = parseFlags(args);
    const asJson = hasFlag(flags, "json");
    const commandHint = process.argv[1]
        ? path.resolve(process.argv[1]).includes("openclaw-1p-sdk-resolver")
            ? path.resolve(process.argv[1])
            : "/absolute/path/to/openclaw-1p-sdk-resolver"
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
    }
    else {
        streams.stdout.write("Paste into your openclaw.json providers section:\n");
        printJson(streams.stdout, snippet);
    }
    return { code: 0 };
}
async function runResolve(args, runtime) {
    const streams = normalizeStreams(runtime);
    const env = runtime.env ?? process.env;
    const { flags } = parseFlags(args);
    const idsFromFlag = flags.get("id") ?? [];
    const fromStdin = hasFlag(flags, "stdin");
    const asJson = hasFlag(flags, "json");
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
    const refToId = new Map();
    const requestedRefs = [];
    const skipped = new Set();
    for (const id of sanitizedIds) {
        const ref = mapIdToReference(id, effective.config.defaultVault);
        if (!isValidSecretReference(ref)) {
            skipped.add(id);
            continue;
        }
        const vault = extractVaultFromReference(ref);
        if (!vault) {
            skipped.add(id);
            continue;
        }
        if (!isVaultAllowed({
            vault,
            defaultVault: effective.config.defaultVault,
            vaultPolicy: effective.config.vaultPolicy,
            vaultWhitelist: effective.config.vaultWhitelist
        })) {
            skipped.add(id);
            continue;
        }
        refToId.set(ref, id);
        requestedRefs.push(ref);
    }
    if (requestedRefs.length === 0) {
        streams.stderr.write("No resolvable ids after validation and policy checks.\n");
        return { code: 1 };
    }
    try {
        const resolver = runtime.resolver ??
            (await (runtime.createResolver ?? createOnePasswordResolver)({
                auth: env.OP_SERVICE_ACCOUNT_TOKEN.trim(),
                integrationName: effective.config.integrationName,
                integrationVersion: effective.config.integrationVersion
            }));
        const resolved = await resolver.resolveRefs(requestedRefs, effective.config.timeoutMs, effective.config.concurrency);
        const rows = sanitizedIds.map((id) => {
            if (skipped.has(id)) {
                return {
                    id,
                    status: "unresolved",
                    output: "filtered"
                };
            }
            const ref = requestedRefs.find((candidateRef) => refToId.get(candidateRef) === id);
            if (!ref) {
                return {
                    id,
                    status: "unresolved",
                    output: "filtered"
                };
            }
            const value = resolved.get(ref);
            if (typeof value !== "string") {
                return {
                    id,
                    status: "unresolved",
                    output: "missing"
                };
            }
            return {
                id,
                status: "resolved",
                output: reveal ? value : redactedSummary(value)
            };
        });
        if (asJson) {
            printJson(streams.stdout, {
                reveal,
                results: rows
            });
        }
        else {
            streams.stdout.write("id\tstatus\toutput\n");
            for (const row of rows) {
                streams.stdout.write(`${row.id}\t${row.status}\t${row.output}\n`);
            }
        }
        return {
            code: rows.every((row) => row.status === "resolved") ? 0 : 1
        };
    }
    catch {
        streams.stderr.write("Resolver runtime failed.\n");
        return { code: 3 };
    }
}
export async function runCli(argv, runtime) {
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
        streams.stderr.write("Unknown openclaw subcommand. Use: snippet\n");
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
export async function ensureRevealAllowed(options) {
    if (!options.reveal) {
        return true;
    }
    if (options.yes) {
        return true;
    }
    if (options.confirm) {
        return options.confirm();
    }
    if (!options.streams.stdin.isTTY) {
        return false;
    }
    if (!options.streams.stdout.isTTY) {
        return false;
    }
    return confirmRevealWithPrompt(options.streams);
}
export function canReadPath(filePath) {
    try {
        accessSync(filePath, fsConstants.R_OK);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=cli.js.map