export type OpenclawConfigPathResolution = {
    path?: string;
    source: "flag" | "OPENCLAW_CONFIG_PATH" | "OPENCLAW_STATE_DIR" | "OPENCLAW_HOME" | "HOME" | "homedir" | "unresolved";
    reason: string;
    exists: boolean;
    readable: boolean;
};
export type AuditFinding = {
    type: "already_1password" | "candidate_for_1password" | "risky_literal";
    file: string;
    line: number;
    key: string;
    fingerprint: string;
};
export declare function resolveOpenclawConfigPath(options: {
    env: NodeJS.ProcessEnv;
    explicitPath?: string;
}): OpenclawConfigPathResolution;
export declare function collectOpenclawReferences(text: string): string[];
export declare function parseOpenclawConfigText(text: string): {
    parsed?: unknown;
    parseError?: string;
};
export declare function scanRepositoryForSecretCandidates(options: {
    rootDir: string;
    maxFiles?: number;
}): AuditFinding[];
export declare function suggestOpenclawProviderImprovements(options: {
    openclawText?: string;
    references: string[];
}): string[];
//# sourceMappingURL=openclaw.d.ts.map