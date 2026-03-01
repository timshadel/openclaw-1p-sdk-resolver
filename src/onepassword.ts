import { Secrets, createClient } from "@1password/sdk";

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

export function isValidSecretReference(secretReference: string): boolean {
  try {
    Secrets.validateSecretReference(secretReference);
    return true;
  } catch {
    return false;
  }
}

type MaybeSecretsApi = {
  resolve?: (ref: string) => Promise<string>;
  resolveAll?: (refs: string[]) => Promise<unknown>;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout"));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function toMapFromResolveAllResult(refs: string[], result: unknown): Map<string, string> {
  const values = new Map<string, string>();

  if (result instanceof Map) {
    for (const [ref, value] of result.entries()) {
      if (typeof ref === "string" && typeof value === "string") {
        values.set(ref, value);
      }
    }
    return values;
  }

  if (Array.isArray(result)) {
    for (let i = 0; i < result.length && i < refs.length; i += 1) {
      const value = result[i];
      if (typeof value === "string") {
        values.set(refs[i], value);
        continue;
      }
      if (value && typeof value === "object") {
        const candidateValue = (value as { value?: unknown }).value;
        if (typeof candidateValue === "string") {
          values.set(refs[i], candidateValue);
        }
      }
    }
    return values;
  }

  if (result && typeof result === "object") {
    for (const ref of refs) {
      const value = (result as Record<string, unknown>)[ref];
      if (typeof value === "string") {
        values.set(ref, value);
        continue;
      }
      if (value && typeof value === "object") {
        const candidateValue = (value as { value?: unknown }).value;
        if (typeof candidateValue === "string") {
          values.set(ref, candidateValue);
        }
      }
    }
  }

  return values;
}

async function resolveWithConcurrency(
  secrets: Required<Pick<MaybeSecretsApi, "resolve">>,
  refs: string[],
  timeoutMs: number,
  concurrency: number
): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  const queue = [...refs];

  // Worker pool bounds in-flight SDK calls and preserves fail-soft semantics.
  const workers = Array.from({ length: Math.min(concurrency, refs.length) }, async () => {
    while (queue.length > 0) {
      const ref = queue.shift();
      if (!ref) {
        continue;
      }
      try {
        const value = await withTimeout(secrets.resolve(ref), timeoutMs);
        if (typeof value === "string") {
          values.set(ref, value);
        }
      } catch {
        // Individual failures are expected and omitted from output.
      }
    }
  });

  await Promise.all(workers);
  return values;
}

export async function createOnePasswordResolver(options: {
  auth: string;
  clientName: string;
  clientVersion: string;
}): Promise<SecretResolver> {
  const client = await createClient({
    auth: options.auth,
    integrationName: options.clientName,
    integrationVersion: options.clientVersion
  });

  const secrets = (client as { secrets?: MaybeSecretsApi }).secrets;
  if (!secrets) {
    throw new Error("1password-secrets-api-missing");
  }

  return {
    async resolveRefs(refs: string[], timeoutMs: number, concurrency: number): Promise<Map<string, string>> {
      if (refs.length === 0) {
        return new Map<string, string>();
      }

      if (typeof secrets.resolveAll === "function") {
        try {
          const result = await withTimeout(secrets.resolveAll(refs), timeoutMs);
          const mapped = toMapFromResolveAllResult(refs, result);
          if (mapped.size > 0 || typeof secrets.resolve !== "function") {
            return mapped;
          }
          // Some SDK versions may return non-string/non-map bulk payload shapes;
          // fall back to per-ref resolve for compatibility.
          return resolveWithConcurrency(
            { resolve: secrets.resolve.bind(secrets) },
            refs,
            timeoutMs,
            concurrency
          );
        } catch {
          // Fall back to per-ref resolving for compatibility/resilience.
        }
      }

      if (typeof secrets.resolve !== "function") {
        return new Map<string, string>();
      }

      return resolveWithConcurrency({ resolve: secrets.resolve.bind(secrets) }, refs, timeoutMs, concurrency);
    }
  };
}
