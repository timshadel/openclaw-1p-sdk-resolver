import { Buffer } from "node:buffer";
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
export declare function loadConfig(env: NodeJS.ProcessEnv): RuntimeConfig;
export declare function parseRequestBuffer(buffer: Buffer, maxStdinBytes: number): NormalizedRequest | null;
export declare function formatResponse(payload: ResponsePayload): string;
//# sourceMappingURL=protocol.d.ts.map