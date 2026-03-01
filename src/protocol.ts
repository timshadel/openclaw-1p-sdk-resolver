import { Buffer } from "node:buffer";
import { accessSync, constants as fsConstants, existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Protocol/config boundary:
 * - Parses untrusted stdin JSON into a strict request shape.
 * - Loads runtime config from env + JSON file with safe defaults/caps.
 * - Produces JSON response payloads without side effects.
 */
export type RawRequest = {
  protocolVersion?: unknown;
  ids?: unknown;
};

export type NormalizedRequest = {
  protocolVersion: number;
  ids: unknown[];
};

export type ResponsePayload = {
  protocolVersion: number;
  values: Record<string, string>;
};

type FileConfig = {
  vault?: unknown;
  defaultVault?: unknown;
  vaultPolicy?: unknown;
  vaultWhitelist?: unknown;
  allowedIdRegex?: unknown;
  maxIds?: unknown;
  maxStdinBytes?: unknown;
  timeoutMs?: unknown;
  stdinTimeoutMs?: unknown;
  concurrency?: unknown;
  onePasswordClientName?: unknown;
  onePasswordClientVersion?: unknown;
};

const DEFAULTS = {
  defaultVault: "default",
  vaultPolicy: "default_vault",
  maxIds: 50,
  maxStdinBytes: 128 * 1024,
  timeoutMs: 25_000,
  stdinTimeoutMs: 5_000,
  concurrency: 4,
  onePasswordClientName: "openclaw-1p-sdk-resolver",
  onePasswordClientVersion: "1.0.0"
} as const;

const CAPS = {
  maxIds: 200,
  maxStdinBytes: 1024 * 1024,
  concurrency: 10
} as const;

export type RuntimeConfig = {
  defaultVault: string;
  vaultPolicy: "default_vault" | "default_vault+whitelist" | "any";
  vaultWhitelist: string[];
  allowedIdRegex?: RegExp;
  maxIds: number;
  maxStdinBytes: number;
  timeoutMs: number;
  stdinTimeoutMs: number;
  concurrency: number;
  onePasswordClientName: string;
  onePasswordClientVersion: string;
};

export type ConfigValueSource = "default" | "config-file" | "env";

export type ConfigPathSource = "OP_RESOLVER_CONFIG" | "XDG_CONFIG_HOME" | "HOME" | "unresolved";

export type ConfigPathResolution = {
  path?: string;
  source: ConfigPathSource;
  reason: string;
  exists: boolean;
  readable: boolean;
};

export type ConfigProvenanceEntry<T> = {
  value: T;
  source: ConfigValueSource;
  notes: string[];
};

export type ConfigProvenance = {
  [K in keyof RuntimeConfig]: ConfigProvenanceEntry<RuntimeConfig[K]>;
};

export type ConfigIssue = {
  level: "warning" | "error";
  code: string;
  message: string;
  key?: keyof RuntimeConfig | "config-file" | "path";
};

type FileLoadResult = {
  path: ConfigPathResolution;
  fileConfig: FileConfig;
  rawText?: string;
  loaded: boolean;
};

export type EffectiveConfig = {
  config: RuntimeConfig;
  defaults: RuntimeConfig;
  provenance: ConfigProvenance;
  issues: ConfigIssue[];
  path: ConfigPathResolution;
  file: {
    loaded: boolean;
    rawText?: string;
  };
};

type ConfigFs = {
  readFileSync: typeof readFileSync;
  existsSync: typeof existsSync;
  accessSync: typeof accessSync;
};

function parseIntLike(value: unknown, fallback: number): number {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createDefaultConfig(): RuntimeConfig {
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
    onePasswordClientName: DEFAULTS.onePasswordClientName,
    onePasswordClientVersion: DEFAULTS.onePasswordClientVersion
  };
}

export function resolveConfigPath(env: NodeJS.ProcessEnv): ConfigPathResolution {
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

function readConfigFile(env: NodeJS.ProcessEnv, issues: ConfigIssue[], fs: ConfigFs): FileLoadResult {
  const configPath = resolveConfigPath(env);
  if (!configPath.path) {
    return {
      path: configPath,
      fileConfig: {},
      loaded: false
    };
  }

  const pathInfo: ConfigPathResolution = {
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
  } catch {
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
    const parsed = JSON.parse(raw) as unknown;
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
      fileConfig: parsed as FileConfig,
      rawText: raw,
      loaded: true
    };
  } catch {
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

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumberSetting(options: {
  key: keyof Pick<
    RuntimeConfig,
    "maxIds" | "maxStdinBytes" | "timeoutMs" | "stdinTimeoutMs" | "concurrency"
  >;
  raw: unknown;
  fallback: number;
  min: number;
  max: number;
  issues: ConfigIssue[];
}): ConfigProvenanceEntry<number> {
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
  const notes: string[] = [];
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

export function loadEffectiveConfig(options: {
  env: NodeJS.ProcessEnv;
  fs?: Partial<ConfigFs>;
}): EffectiveConfig {
  const fs: ConfigFs = {
    readFileSync: options.fs?.readFileSync ?? readFileSync,
    existsSync: options.fs?.existsSync ?? existsSync,
    accessSync: options.fs?.accessSync ?? accessSync
  };
  const issues: ConfigIssue[] = [];
  const defaults = createDefaultConfig();
  const fileLoad = readConfigFile(options.env, issues, fs);
  const fileConfig = fileLoad.fileConfig;

  const defaultVaultFromDefaultVault = cleanString(fileConfig.defaultVault);
  const defaultVaultFromLegacy = cleanString(fileConfig.vault);
  let defaultVaultEntry: ConfigProvenanceEntry<string> = {
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
  } else if (defaultVaultFromLegacy) {
    defaultVaultEntry = {
      value: defaultVaultFromLegacy,
      source: "config-file",
      notes: ["Using legacy 'vault' key."]
    };
  } else if (fileConfig.defaultVault !== undefined || fileConfig.vault !== undefined) {
    issues.push({
      level: "error",
      code: "invalid_default_vault",
      message: "defaultVault (or legacy vault) must be a non-empty string.",
      key: "defaultVault"
    });
  }

  const vaultPolicyEntry: ConfigProvenanceEntry<RuntimeConfig["vaultPolicy"]> =
    fileConfig.vaultPolicy === undefined
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

  const vaultWhitelistNotes: string[] = [];
  let vaultWhitelistEntry: ConfigProvenanceEntry<string[]> = {
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
    } else {
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
      const cleaned = Array.from(
        new Set(
          fileConfig.vaultWhitelist
            .filter((entry): entry is string => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        )
      );
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

  let allowedIdRegexEntry: ConfigProvenanceEntry<RegExp | undefined> = {
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
    } else {
      try {
        allowedIdRegexEntry = {
          value: new RegExp(fileConfig.allowedIdRegex),
          source: "config-file",
          notes: []
        };
      } catch {
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

  function readStringSetting(
    key: keyof Pick<RuntimeConfig, "onePasswordClientName" | "onePasswordClientVersion">,
    raw: unknown,
    fallback: string
  ): ConfigProvenanceEntry<string> {
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

  const onePasswordClientNameEntry = readStringSetting(
    "onePasswordClientName",
    fileConfig.onePasswordClientName,
    defaults.onePasswordClientName
  );

  const onePasswordClientVersionEntry = readStringSetting(
    "onePasswordClientVersion",
    fileConfig.onePasswordClientVersion,
    defaults.onePasswordClientVersion
  );

  const config: RuntimeConfig = {
    defaultVault: defaultVaultEntry.value,
    vaultPolicy: vaultPolicyEntry.value,
    vaultWhitelist: vaultWhitelistEntry.value,
    allowedIdRegex: allowedIdRegexEntry.value,
    maxIds: maxIdsEntry.value,
    maxStdinBytes: maxStdinBytesEntry.value,
    timeoutMs: timeoutMsEntry.value,
    stdinTimeoutMs: stdinTimeoutMsEntry.value,
    concurrency: concurrencyEntry.value,
    onePasswordClientName: onePasswordClientNameEntry.value,
    onePasswordClientVersion: onePasswordClientVersionEntry.value
  };

  const provenance: ConfigProvenance = {
    defaultVault: defaultVaultEntry,
    vaultPolicy: vaultPolicyEntry,
    vaultWhitelist: vaultWhitelistEntry,
    allowedIdRegex: allowedIdRegexEntry,
    maxIds: maxIdsEntry,
    maxStdinBytes: maxStdinBytesEntry,
    timeoutMs: timeoutMsEntry,
    stdinTimeoutMs: stdinTimeoutMsEntry,
    concurrency: concurrencyEntry,
    onePasswordClientName: onePasswordClientNameEntry,
    onePasswordClientVersion: onePasswordClientVersionEntry
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

export function loadConfig(env: NodeJS.ProcessEnv): RuntimeConfig {
  return loadEffectiveConfig({ env }).config;
}

export function parseRequestBuffer(
  buffer: Buffer,
  maxStdinBytes: number
): NormalizedRequest | null {
  // Reject oversized input before parse to avoid expensive work on untrusted data.
  if (buffer.byteLength > maxStdinBytes) {
    return null;
  }

  let parsed: RawRequest;
  try {
    parsed = JSON.parse(buffer.toString("utf8")) as RawRequest;
  } catch {
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
    protocolVersion: parsed.protocolVersion as number,
    ids: parsed.ids
  };
}

export function formatResponse(payload: ResponsePayload): string {
  return JSON.stringify(payload);
}
