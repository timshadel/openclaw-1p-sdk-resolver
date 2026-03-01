export type OpenclawConfigPathResolution = {
    path?: string;
    source: "flag" | "OPENCLAW_CONFIG_PATH" | "OPENCLAW_STATE_DIR" | "OPENCLAW_HOME" | "HOME" | "homedir" | "unresolved";
    reason: string;
    exists: boolean;
    readable: boolean;
};
export type OpenclawProviderFinding = {
    code: "provider_missing" | "provider_kind_mismatch" | "provider_json_only_missing" | "provider_command_missing" | "provider_passenv_missing";
    message: string;
    path: string;
    expected?: unknown;
    actual?: unknown;
};
export type OpenclawProviderCheckResult = {
    providerFound: boolean;
    findings: OpenclawProviderFinding[];
    suggestions: string[];
};
export declare const DEFAULT_OPENCLAW_PROVIDER_ALIAS = "1p-sdk-resolver";
export declare function resolveOpenclawConfigPath(options: {
    env: NodeJS.ProcessEnv;
    explicitPath?: string;
}): OpenclawConfigPathResolution;
export declare function parseOpenclawConfigText(text: string): {
    parsed?: unknown;
    parseError?: string;
};
export declare function buildResolverProviderSnippet(options: {
    commandHint: string;
    providerAlias?: string;
}): {
    providers: Array<{
        name: string;
        kind: "exec";
        config: {
            jsonOnly: true;
            command: string;
            passEnv: string[];
            trustedDirs: string[];
        };
    }>;
};
export declare function checkOpenclawProviderSetup(options: {
    parsedConfig: unknown;
    providerAlias?: string;
}): OpenclawProviderCheckResult;
//# sourceMappingURL=openclaw.d.ts.map