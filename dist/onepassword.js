import { Secrets, createClient } from "@1password/sdk";
export function isValidSecretReference(secretReference) {
    try {
        Secrets.validateSecretReference(secretReference);
        return true;
    }
    catch {
        return false;
    }
}
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error("timeout"));
        }, timeoutMs);
        promise
            .then((value) => {
            clearTimeout(timer);
            resolve(value);
        })
            .catch((error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
function toMapFromResolveAllResult(refs, result) {
    const values = new Map();
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
            }
        }
        return values;
    }
    if (result && typeof result === "object") {
        for (const ref of refs) {
            const value = result[ref];
            if (typeof value === "string") {
                values.set(ref, value);
            }
        }
    }
    return values;
}
async function resolveWithConcurrency(secrets, refs, timeoutMs, concurrency) {
    const values = new Map();
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
            }
            catch {
                // Individual failures are expected and omitted from output.
            }
        }
    });
    await Promise.all(workers);
    return values;
}
export async function createOnePasswordResolver(options) {
    const client = await createClient({
        auth: options.auth,
        integrationName: options.integrationName,
        integrationVersion: options.integrationVersion
    });
    const secrets = client.secrets;
    if (!secrets) {
        throw new Error("1password-secrets-api-missing");
    }
    return {
        async resolveRefs(refs, timeoutMs, concurrency) {
            if (refs.length === 0) {
                return new Map();
            }
            if (typeof secrets.resolveAll === "function") {
                try {
                    const result = await withTimeout(secrets.resolveAll(refs), timeoutMs);
                    return toMapFromResolveAllResult(refs, result);
                }
                catch {
                    // Fall back to per-ref resolving for compatibility/resilience.
                }
            }
            if (typeof secrets.resolve !== "function") {
                return new Map();
            }
            return resolveWithConcurrency({ resolve: secrets.resolve.bind(secrets) }, refs, timeoutMs, concurrency);
        }
    };
}
//# sourceMappingURL=onepassword.js.map