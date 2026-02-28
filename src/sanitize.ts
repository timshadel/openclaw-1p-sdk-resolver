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
  if (id.startsWith("op://")) {
    return id;
  }

  return `op://${vault}/${id}`;
}
