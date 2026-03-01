import { Buffer } from "node:buffer";
import { accessSync, existsSync, readFileSync } from "node:fs";
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
    integrationName: string;
    integrationVersion: string;
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
export declare function resolveConfigPath(env: NodeJS.ProcessEnv): ConfigPathResolution;
export declare function loadEffectiveConfig(options: {
    env: NodeJS.ProcessEnv;
    fs?: Partial<ConfigFs>;
}): EffectiveConfig;
export declare function loadConfig(env: NodeJS.ProcessEnv): RuntimeConfig;
export declare function parseRequestBuffer(buffer: Buffer, maxStdinBytes: number): NormalizedRequest | null;
export declare function formatResponse(payload: ResponsePayload): string;
export {};
//# sourceMappingURL=protocol.d.ts.map