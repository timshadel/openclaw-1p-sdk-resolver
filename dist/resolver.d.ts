import { Buffer } from "node:buffer";
import { type SecretResolver } from "./onepassword.js";
/**
 * Resolver orchestration entrypoint.
 * Pipeline: read stdin -> parse protocol -> sanitize ids -> map/enforce vault policy
 * -> resolve via 1Password adapter -> emit protocol JSON.
 *
 * Security posture: fail closed and always return a valid response payload.
 */
export type ResolverRuntime = {
    stdin?: NodeJS.ReadableStream;
    stdout?: NodeJS.WritableStream;
    env?: NodeJS.ProcessEnv;
    resolver?: SecretResolver;
};
export declare function buildRequestedRefs(options: {
    ids: string[];
    defaultVault: string;
    vaultPolicy: "default_vault" | "default_vault+whitelist" | "any";
    vaultWhitelist: string[];
}): {
    refs: string[];
    refToId: Map<string, string>;
};
export declare function mapResolvedValuesToIds(resolved: Map<string, string>, refToId: Map<string, string>): Record<string, string>;
export declare function readStdinWithLimit(stream: NodeJS.ReadableStream, maxBytes: number, timeoutMs: number): Promise<{
    ok: boolean;
    buffer: Buffer;
}>;
export declare function runResolver(runtime?: ResolverRuntime): Promise<void>;
export declare function runCli(argv?: string[]): Promise<void>;
export declare function runMain(options?: {
    run?: (argv?: string[]) => Promise<void>;
    argv?: string[];
    processLike?: {
        exitCode?: number;
    };
}): Promise<void>;
//# sourceMappingURL=resolver.d.ts.map