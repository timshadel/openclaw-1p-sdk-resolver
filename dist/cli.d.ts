import { closeSync, openSync, writeFileSync } from "node:fs";
import { createOnePasswordResolver, type SecretResolver } from "./onepassword.js";
type CliStreams = {
    stdin: NodeJS.ReadableStream;
    stdout: NodeJS.WritableStream;
    stderr: NodeJS.WritableStream;
};
type CliRuntime = {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    entryScriptPath?: string;
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
export declare function parseFlags(args: string[]): {
    positionals: string[];
    flags: Map<string, string[]>;
};
export declare function getLastFlag(flags: Map<string, string[]>, name: string): string | undefined;
export declare function hasFlag(flags: Map<string, string[]>, name: string): boolean;
export declare function getStringFlag(flags: Map<string, string[]>, name: string): string | undefined;
export declare function truncateCell(value: string, maxWidth: number): string;
export declare function displayValue(value: unknown): string;
export declare function renderAsciiTable(columns: TableColumn[], rows: string[][]): string;
export declare function writeConfigFileSafely(options: {
    filePath: string;
    body: string;
    overwrite: boolean;
    fsOps?: Partial<SafeWriteFsOps>;
}): {
    ok: true;
} | {
    ok: false;
    message: string;
};
export declare function buildRowsForNoRequestedRefs(sanitizedIds: string[], unresolvedReasons: Map<string, string>): ResolveRow[];
export declare function buildRowsForResolvedRefs(options: {
    sanitizedIds: string[];
    unresolvedReasons: Map<string, string>;
    requestedRefs: string[];
    refToId: Map<string, string>;
    resolved: Map<string, string>;
    reveal: boolean;
}): ResolveRow[];
export declare function toResolveJsonPayload(rows: ResolveRow[], options: {
    debug: boolean;
    reveal: boolean;
}): {
    debug: boolean;
    reveal: boolean;
    results: Array<{
        id: string;
        status: string;
        output: string;
        reason?: string;
    }>;
};
export declare function renderResolveTable(rows: ResolveRow[], debug: boolean): string;
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