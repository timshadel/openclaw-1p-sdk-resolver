import { readFileSync } from "node:fs";
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
function resolveConfigPath(env) {
    // Explicit env override wins to support deterministic deployment wiring.
    if (env.OP_RESOLVER_CONFIG?.trim()) {
        return env.OP_RESOLVER_CONFIG.trim();
    }
    const baseDir = env.XDG_CONFIG_HOME?.trim()
        ? env.XDG_CONFIG_HOME.trim()
        : env.HOME?.trim()
            ? path.join(env.HOME.trim(), ".config")
            : undefined;
    if (!baseDir) {
        return undefined;
    }
    return path.join(baseDir, "openclaw-1p-sdk-resolver", "config.json");
}
function readConfigFile(env) {
    const configPath = resolveConfigPath(env);
    if (!configPath) {
        return {};
    }
    try {
        const raw = readFileSync(configPath, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
            return {};
        }
        return parsed;
    }
    catch {
        return {};
    }
}
export function loadConfig(env) {
    const fileConfig = readConfigFile(env);
    const maxIds = clamp(parseIntLike(fileConfig.maxIds, DEFAULTS.maxIds), 1, CAPS.maxIds);
    const maxStdinBytes = clamp(parseIntLike(fileConfig.maxStdinBytes, DEFAULTS.maxStdinBytes), 1, CAPS.maxStdinBytes);
    const timeoutMs = clamp(parseIntLike(fileConfig.timeoutMs, DEFAULTS.timeoutMs), 1000, 120_000);
    const stdinTimeoutMs = clamp(parseIntLike(fileConfig.stdinTimeoutMs, DEFAULTS.stdinTimeoutMs), 1000, 120_000);
    const concurrency = clamp(parseIntLike(fileConfig.concurrency, DEFAULTS.concurrency), 1, CAPS.concurrency);
    let allowedIdRegex;
    if (typeof fileConfig.allowedIdRegex === "string" && fileConfig.allowedIdRegex.length > 0) {
        try {
            allowedIdRegex = new RegExp(fileConfig.allowedIdRegex);
        }
        catch {
            // Invalid user regex should fail closed by matching nothing.
            allowedIdRegex = /$a/;
        }
    }
    const configDefaultVault = typeof fileConfig.defaultVault === "string" && fileConfig.defaultVault.trim().length > 0
        ? fileConfig.defaultVault.trim()
        : typeof fileConfig.vault === "string" && fileConfig.vault.trim().length > 0
            ? fileConfig.vault.trim()
            : DEFAULTS.defaultVault;
    const vaultPolicy = fileConfig.vaultPolicy === "default_vault" ||
        fileConfig.vaultPolicy === "default_vault+whitelist" ||
        fileConfig.vaultPolicy === "any"
        ? fileConfig.vaultPolicy
        : DEFAULTS.vaultPolicy;
    const vaultWhitelist = Array.isArray(fileConfig.vaultWhitelist)
        ? Array.from(new Set(fileConfig.vaultWhitelist
            .filter((entry) => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)))
        : [];
    return {
        defaultVault: configDefaultVault,
        vaultPolicy,
        vaultWhitelist,
        allowedIdRegex,
        maxIds,
        maxStdinBytes,
        timeoutMs,
        stdinTimeoutMs,
        concurrency,
        integrationName: typeof fileConfig.integrationName === "string" && fileConfig.integrationName.trim().length > 0
            ? fileConfig.integrationName.trim()
            : DEFAULTS.integrationName,
        integrationVersion: typeof fileConfig.integrationVersion === "string" && fileConfig.integrationVersion.trim().length > 0
            ? fileConfig.integrationVersion.trim()
            : DEFAULTS.integrationVersion
    };
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