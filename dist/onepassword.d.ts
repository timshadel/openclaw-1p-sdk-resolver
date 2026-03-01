/**
 * Thin 1Password SDK adapter.
 * - Uses service account client auth from caller.
 * - Prefers bulk `resolveAll` when available.
 * - Falls back to concurrency-limited per-ref `resolve`.
 * - Returns partial success maps; unresolved refs are omitted.
 */
export type SecretResolver = {
    resolveRefs(refs: string[], timeoutMs: number, concurrency: number): Promise<Map<string, string>>;
};
export declare function isValidSecretReference(secretReference: string): boolean;
export declare function createOnePasswordResolver(options: {
    auth: string;
    integrationName: string;
    integrationVersion: string;
}): Promise<SecretResolver>;
//# sourceMappingURL=onepassword.d.ts.map