/**
 * Sanitization and policy helpers:
 * - Normalize/validate incoming IDs from untrusted protocol input.
 * - Convert IDs into 1Password references.
 * - Enforce vault policy for explicit op:// references.
 */
export declare function sanitizeId(id: unknown, allowlist?: RegExp): string | null;
export declare function sanitizeIds(ids: unknown[], maxIds: number, allowlist?: RegExp): string[];
export declare function mapIdToReference(id: string, vault: string): string;
export declare function extractVaultFromReference(ref: string): string | null;
export declare function isVaultAllowed(options: {
    vault: string;
    defaultVault: string;
    vaultPolicy: "default_vault" | "default_vault+whitelist" | "any";
    vaultWhitelist: string[];
}): boolean;
//# sourceMappingURL=sanitize.d.ts.map