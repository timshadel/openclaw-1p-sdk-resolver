/**
 * Sanitization and policy helpers:
 * - Normalize/validate incoming IDs from untrusted protocol input.
 * - Convert IDs into 1Password references.
 * - Enforce vault policy for explicit op:// references.
 */
export function sanitizeId(id: unknown, allowlist?: RegExp): string | null {
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

export function sanitizeIds(ids: unknown[], maxIds: number, allowlist?: RegExp): string[] {
  const output: string[] = [];
  const seen = new Set<string>();

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

export function mapIdToReference(id: string, vault: string): string {
  // Explicit refs are treated as caller intent and remain unchanged.
  if (id.startsWith("op://")) {
    return id;
  }

  return `op://${vault}/${id}`;
}

export function extractVaultFromReference(ref: string): string | null {
  const match = /^op:\/\/([^/]+)\/.+/.exec(ref);
  if (!match) {
    return null;
  }
  return match[1];
}

export function isVaultAllowed(options: {
  vault: string;
  defaultVault: string;
  vaultPolicy: "default_vault" | "default_vault+whitelist" | "any";
  vaultWhitelist: string[];
}): boolean {
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
