import { createOnePasswordResolver, type SecretResolver } from "./onepassword.js";
type CliStreams = {
    stdin: NodeJS.ReadableStream;
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
};
type CliRuntime = {
    env?: NodeJS.ProcessEnv;
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
export declare function runCli(argv: string[], runtime: CliRuntime): Promise<number>;
export declare function ensureRevealAllowed(options: {
    reveal: boolean;
    yes: boolean;
    streams: CliStreams;
    confirm?: () => Promise<boolean>;
}): Promise<boolean>;
export declare function canReadPath(filePath: string): boolean;
export {};
//# sourceMappingURL=cli.d.ts.map