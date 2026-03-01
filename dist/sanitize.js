/**
 * Sanitization and policy helpers:
 * - Normalize/validate incoming IDs from untrusted protocol input.
 * - Convert IDs into 1Password references.
 * - Enforce vault policy for explicit op:// references.
 */
export function sanitizeId(id, allowlist) {
    if (typeof id !== "string") {
        return null;
    }
    const trimmed = id.trim();
    if (!trimmed) {
        return null;
    }
    if (trimmed.includes("\0") || trimmed.includes("\n") || trimmed.includes("\r")) {
        return null;
    }
    if (trimmed.includes("..")) {
        return null;
    }
    if (allowlist && !allowlist.test(trimmed)) {
        return null;
    }
    return trimmed;
}
export function sanitizeIds(ids, maxIds, allowlist) {
    const output = [];
    const seen = new Set();
    for (const raw of ids) {
        const id = sanitizeId(raw, allowlist);
        if (!id || seen.has(id)) {
            continue;
        }
        output.push(id);
        seen.add(id);
        if (output.length >= maxIds) {
            break;
        }
    }
    return output;
}
export function mapIdToReference(id, vault) {
    // Explicit refs are treated as caller intent and remain unchanged.
    if (id.startsWith("op://")) {
        return id;
    }
    return `op://${vault}/${id}`;
}
export function extractVaultFromReference(ref) {
    const match = /^op:\/\/([^/]+)\/.+/.exec(ref);
    if (!match) {
        return null;
    }
    return match[1];
}
export function isVaultAllowed(options) {
    // Policy is applied only after extracting a concrete vault name.
    if (options.vaultPolicy === "any") {
        return true;
    }
    if (options.vault === options.defaultVault) {
        return true;
    }
    if (options.vaultPolicy === "default_vault+whitelist") {
        return options.vaultWhitelist.includes(options.vault);
    }
    return false;
}
//# sourceMappingURL=sanitize.js.map