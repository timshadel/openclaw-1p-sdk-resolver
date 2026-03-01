import { accessSync, constants as fsConstants, existsSync, readFileSync } from "node:fs";
import path from "node:path";
const DEFAULTS = {
    defaultVault: "default",
    vaultPolicy: "default_vault",
    maxIds: 50,
    maxStdinBytes: 128 * 1024,
    timeoutMs: 25_000,
    stdinTimeoutMs: 5_000,
    concurrency: 4,
    integrationName: "openclaw-1p-sdk-resolver",
    integrationVersion: "1.0.0"
};
const CAPS = {
    maxIds: 200,
    maxStdinBytes: 1024 * 1024,
    concurrency: 10
};
function parseIntLike(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.trunc(value);
    }
    if (typeof value === "string") {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function createDefaultConfig() {
    return {
        defaultVault: DEFAULTS.defaultVault,
        vaultPolicy: DEFAULTS.vaultPolicy,
        vaultWhitelist: [],
        allowedIdRegex: undefined,
        maxIds: DEFAULTS.maxIds,
        maxStdinBytes: DEFAULTS.maxStdinBytes,
        timeoutMs: DEFAULTS.timeoutMs,
        stdinTimeoutMs: DEFAULTS.stdinTimeoutMs,
        concurrency: DEFAULTS.concurrency,
        integrationName: DEFAULTS.integrationName,
        integrationVersion: DEFAULTS.integrationVersion
    };
}
export function resolveConfigPath(env) {
    // Explicit env override wins to support deterministic deployment wiring.
    if (env.OP_RESOLVER_CONFIG?.trim()) {
        const resolvedPath = env.OP_RESOLVER_CONFIG.trim();
        return {
            path: resolvedPath,
            source: "OP_RESOLVER_CONFIG",
            reason: "Using explicit OP_RESOLVER_CONFIG override.",
            exists: existsSync(resolvedPath),
            readable: false
        };
    }
    const baseDir = env.XDG_CONFIG_HOME?.trim()
        ? env.XDG_CONFIG_HOME.trim()
        : env.HOME?.trim()
            ? path.join(env.HOME.trim(), ".config")
            : undefined;
    if (!baseDir) {
        return {
            source: "unresolved",
            reason: "No OP_RESOLVER_CONFIG, XDG_CONFIG_HOME, or HOME provided.",
            exists: false,
            readable: false
        };
    }
    const resolvedPath = path.join(baseDir, "openclaw-1p-sdk-resolver", "config.json");
    return {
        path: resolvedPath,
        source: env.XDG_CONFIG_HOME?.trim() ? "XDG_CONFIG_HOME" : "HOME",
        reason: env.XDG_CONFIG_HOME?.trim()
            ? "Using XDG_CONFIG_HOME as base directory."
            : "Using HOME/.config as base directory.",
        exists: existsSync(resolvedPath),
        readable: false
    };
}
function readConfigFile(env, issues, fs) {
    const configPath = resolveConfigPath(env);
    if (!configPath.path) {
        return {
            path: configPath,
            fileConfig: {},
            loaded: false
        };
    }
    const pathInfo = {
        ...configPath
    };
    if (!fs.existsSync(configPath.path)) {
        return {
            path: pathInfo,
            fileConfig: {},
            loaded: false
        };
    }
    try {
        fs.accessSync(configPath.path, fsConstants.R_OK);
        pathInfo.readable = true;
    }
    catch {
        issues.push({
            level: "error",
            code: "config_unreadable",
            message: "Config file exists but is not readable.",
            key: "path"
        });
        return {
            path: pathInfo,
            fileConfig: {},
            loaded: false
        };
    }
    try {
        const raw = fs.readFileSync(configPath.path, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            issues.push({
                level: "error",
                code: "config_not_object",
                message: "Config file JSON must be an object.",
                key: "config-file"
            });
            return {
                path: pathInfo,
                fileConfig: {},
                rawText: raw,
                loaded: false
            };
        }
        return {
            path: pathInfo,
            fileConfig: parsed,
            rawText: raw,
            loaded: true
        };
    }
    catch {
        issues.push({
            level: "error",
            code: "config_parse_error",
            message: "Config file is not valid JSON.",
            key: "config-file"
        });
        return {
            path: pathInfo,
            fileConfig: {},
            loaded: false
        };
    }
}
function cleanString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function readNumberSetting(options) {
    if (options.raw === undefined) {
        return {
            value: options.fallback,
            source: "default",
            notes: []
        };
    }
    const parsed = parseIntLike(options.raw, Number.NaN);
    if (!Number.isFinite(parsed)) {
        options.issues.push({
            level: "error",
            code: "invalid_number",
            message: `${options.key} must be a finite integer.`,
            key: options.key
        });
        return {
            value: options.fallback,
            source: "default",
            notes: ["Invalid value in config file; default applied."]
        };
    }
    const clamped = clamp(parsed, options.min, options.max);
    const notes = [];
    if (clamped !== parsed) {
        notes.push(`Clamped from ${parsed} to ${clamped}.`);
        options.issues.push({
            level: "warning",
            code: "clamped_value",
            message: `${options.key} was clamped from ${parsed} to ${clamped}.`,
            key: options.key
        });
    }
    return {
        value: clamped,
        source: "config-file",
        notes
    };
}
export function loadEffectiveConfig(options) {
    const fs = {
        readFileSync: options.fs?.readFileSync ?? readFileSync,
        existsSync: options.fs?.existsSync ?? existsSync,
        accessSync: options.fs?.accessSync ?? accessSync
    };
    const issues = [];
    const defaults = createDefaultConfig();
    const fileLoad = readConfigFile(options.env, issues, fs);
    const fileConfig = fileLoad.fileConfig;
    const defaultVaultFromDefaultVault = cleanString(fileConfig.defaultVault);
    const defaultVaultFromLegacy = cleanString(fileConfig.vault);
    let defaultVaultEntry = {
        value: defaults.defaultVault,
        source: "default",
        notes: []
    };
    if (defaultVaultFromDefaultVault) {
        defaultVaultEntry = {
            value: defaultVaultFromDefaultVault,
            source: "config-file",
            notes: []
        };
    }
    else if (defaultVaultFromLegacy) {
        defaultVaultEntry = {
            value: defaultVaultFromLegacy,
            source: "config-file",
            notes: ["Using legacy 'vault' key."]
        };
    }
    else if (fileConfig.defaultVault !== undefined || fileConfig.vault !== undefined) {
        issues.push({
            level: "error",
            code: "invalid_default_vault",
            message: "defaultVault (or legacy vault) must be a non-empty string.",
            key: "defaultVault"
        });
    }
    const vaultPolicyEntry = fileConfig.vaultPolicy === undefined
        ? { value: defaults.vaultPolicy, source: "default", notes: [] }
        : fileConfig.vaultPolicy === "default_vault" ||
            fileConfig.vaultPolicy === "default_vault+whitelist" ||
            fileConfig.vaultPolicy === "any"
            ? { value: fileConfig.vaultPolicy, source: "config-file", notes: [] }
            : (() => {
                issues.push({
                    level: "error",
                    code: "invalid_vault_policy",
                    message: "vaultPolicy must be one of default_vault, default_vault+whitelist, any.",
                    key: "vaultPolicy"
                });
                return {
                    value: defaults.vaultPolicy,
                    source: "default",
                    notes: ["Invalid value in config file; default applied."]
                };
            })();
    const vaultWhitelistNotes = [];
    let vaultWhitelistEntry = {
        value: defaults.vaultWhitelist,
        source: "default",
        notes: []
    };
    if (fileConfig.vaultWhitelist !== undefined) {
        if (!Array.isArray(fileConfig.vaultWhitelist)) {
            issues.push({
                level: "error",
                code: "invalid_vault_whitelist",
                message: "vaultWhitelist must be an array of strings.",
                key: "vaultWhitelist"
            });
        }
        else {
            const invalidEntries = fileConfig.vaultWhitelist.filter((entry) => typeof entry !== "string").length;
            if (invalidEntries > 0) {
                issues.push({
                    level: "warning",
                    code: "vault_whitelist_filtered",
                    message: "vaultWhitelist included non-string entries that were ignored.",
                    key: "vaultWhitelist"
                });
                vaultWhitelistNotes.push("Ignored non-string whitelist entries.");
            }
            const cleaned = Array.from(new Set(fileConfig.vaultWhitelist
                .filter((entry) => typeof entry === "string")
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0)));
            vaultWhitelistEntry = {
                value: cleaned,
                source: "config-file",
                notes: vaultWhitelistNotes
            };
        }
    }
    const maxIdsEntry = readNumberSetting({
        key: "maxIds",
        raw: fileConfig.maxIds,
        fallback: defaults.maxIds,
        min: 1,
        max: CAPS.maxIds,
        issues
    });
    const maxStdinBytesEntry = readNumberSetting({
        key: "maxStdinBytes",
        raw: fileConfig.maxStdinBytes,
        fallback: defaults.maxStdinBytes,
        min: 1,
        max: CAPS.maxStdinBytes,
        issues
    });
    const timeoutMsEntry = readNumberSetting({
        key: "timeoutMs",
        raw: fileConfig.timeoutMs,
        fallback: defaults.timeoutMs,
        min: 1000,
        max: 120_000,
        issues
    });
    const stdinTimeoutMsEntry = readNumberSetting({
        key: "stdinTimeoutMs",
        raw: fileConfig.stdinTimeoutMs,
        fallback: defaults.stdinTimeoutMs,
        min: 1000,
        max: 120_000,
        issues
    });
    const concurrencyEntry = readNumberSetting({
        key: "concurrency",
        raw: fileConfig.concurrency,
        fallback: defaults.concurrency,
        min: 1,
        max: CAPS.concurrency,
        issues
    });
    let allowedIdRegexEntry = {
        value: defaults.allowedIdRegex,
        source: "default",
        notes: []
    };
    if (fileConfig.allowedIdRegex !== undefined) {
        if (typeof fileConfig.allowedIdRegex !== "string" || fileConfig.allowedIdRegex.length === 0) {
            issues.push({
                level: "error",
                code: "invalid_allowed_id_regex",
                message: "allowedIdRegex must be a non-empty string when provided.",
                key: "allowedIdRegex"
            });
        }
        else {
            try {
                allowedIdRegexEntry = {
                    value: new RegExp(fileConfig.allowedIdRegex),
                    source: "config-file",
                    notes: []
                };
            }
            catch {
                allowedIdRegexEntry = {
                    value: /$a/,
                    source: "config-file",
                    notes: ["Invalid regex in config; fail-closed regex /$a/ applied."]
                };
                issues.push({
                    level: "error",
                    code: "invalid_allowed_id_regex",
                    message: "allowedIdRegex failed to compile; fail-closed regex applied.",
                    key: "allowedIdRegex"
                });
            }
        }
    }
    function readStringSetting(key, raw, fallback) {
        const cleaned = cleanString(raw);
        if (raw === undefined) {
            return {
                value: fallback,
                source: "default",
                notes: []
            };
        }
        if (!cleaned) {
            issues.push({
                level: "error",
                code: "invalid_string",
                message: `${key} must be a non-empty string.`,
                key
            });
            return {
                value: fallback,
                source: "default",
                notes: ["Invalid value in config file; default applied."]
            };
        }
        return {
            value: cleaned,
            source: "config-file",
            notes: []
        };
    }
    const integrationNameEntry = readStringSetting("integrationName", fileConfig.integrationName, defaults.integrationName);
    const integrationVersionEntry = readStringSetting("integrationVersion", fileConfig.integrationVersion, defaults.integrationVersion);
    const config = {
        defaultVault: defaultVaultEntry.value,
        vaultPolicy: vaultPolicyEntry.value,
        vaultWhitelist: vaultWhitelistEntry.value,
        allowedIdRegex: allowedIdRegexEntry.value,
        maxIds: maxIdsEntry.value,
        maxStdinBytes: maxStdinBytesEntry.value,
        timeoutMs: timeoutMsEntry.value,
        stdinTimeoutMs: stdinTimeoutMsEntry.value,
        concurrency: concurrencyEntry.value,
        integrationName: integrationNameEntry.value,
        integrationVersion: integrationVersionEntry.value
    };
    const provenance = {
        defaultVault: defaultVaultEntry,
        vaultPolicy: vaultPolicyEntry,
        vaultWhitelist: vaultWhitelistEntry,
        allowedIdRegex: allowedIdRegexEntry,
        maxIds: maxIdsEntry,
        maxStdinBytes: maxStdinBytesEntry,
        timeoutMs: timeoutMsEntry,
        stdinTimeoutMs: stdinTimeoutMsEntry,
        concurrency: concurrencyEntry,
        integrationName: integrationNameEntry,
        integrationVersion: integrationVersionEntry
    };
    return {
        config,
        defaults,
        provenance,
        issues,
        path: fileLoad.path,
        file: {
            loaded: fileLoad.loaded,
            rawText: fileLoad.rawText
        }
    };
}
export function loadConfig(env) {
    return loadEffectiveConfig({ env }).config;
}
export function parseRequestBuffer(buffer, maxStdinBytes) {
    // Reject oversized input before parse to avoid expensive work on untrusted data.
    if (buffer.byteLength > maxStdinBytes) {
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(buffer.toString("utf8"));
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object") {
        return null;
    }
    if (!Number.isInteger(parsed.protocolVersion)) {
        return null;
    }
    if (!Array.isArray(parsed.ids)) {
        return null;
    }
    return {
        protocolVersion: parsed.protocolVersion,
        ids: parsed.ids
    };
}
export function formatResponse(payload) {
    return JSON.stringify(payload);
}
//# sourceMappingURL=protocol.js.map