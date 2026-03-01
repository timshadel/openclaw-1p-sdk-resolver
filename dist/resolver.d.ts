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
export declare function readStdinWithLimit(stream: NodeJS.ReadableStream, maxBytes: number, timeoutMs: number): Promise<{
    ok: boolean;
    buffer: Buffer;
}>;
export declare function runResolver(runtime?: ResolverRuntime): Promise<void>;
export declare function runCli(argv?: string[]): Promise<void>;
//# sourceMappingURL=resolver.d.ts.map