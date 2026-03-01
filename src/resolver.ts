import { Buffer } from "node:buffer";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import { runCli as runCommandCli } from "./cli.js";
import { formatResponse, loadConfig, parseRequestBuffer, type ResponsePayload } from "./protocol.js";
import { createOnePasswordResolver, isValidSecretReference, type SecretResolver } from "./onepassword.js";
import { extractVaultFromReference, isVaultAllowed, mapIdToReference, sanitizeIds } from "./sanitize.js";

/**
 * Resolver orchestration entrypoint.
 * Pipeline: read stdin -> parse protocol -> sanitize ids -> map/enforce vault policy
 * -> resolve via 1Password adapter -> emit protocol JSON.
 *
 * Security posture: fail closed and always return a valid response payload.
 */
export type ResolverRuntime = {
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
  resolver?: SecretResolver;
};

export function buildRequestedRefs(options: {
  ids: string[];
  defaultVault: string;
  vaultPolicy: "default_vault" | "default_vault+whitelist" | "any";
  vaultWhitelist: string[];
}): { refs: string[]; refToId: Map<string, string> } {
  const refToId = new Map<string, string>();
  const refs: string[] = [];

  for (const id of options.ids) {
    const ref = mapIdToReference(id, options.defaultVault);
    if (!isValidSecretReference(ref)) {
      continue;
    }
    const vault = extractVaultFromReference(ref);
    if (!vault) {
      continue;
    }
    if (
      !isVaultAllowed({
        vault,
        defaultVault: options.defaultVault,
        vaultPolicy: options.vaultPolicy,
        vaultWhitelist: options.vaultWhitelist
      })
    ) {
      continue;
    }
    refToId.set(ref, id);
    refs.push(ref);
  }

  return { refs, refToId };
}

export function mapResolvedValuesToIds(resolved: Map<string, string>, refToId: Map<string, string>): Record<string, string> {
  const values = Object.create(null) as Record<string, string>;
  for (const [ref, value] of resolved.entries()) {
    const id = refToId.get(ref);
    if (id && typeof value === "string") {
      values[id] = value;
    }
  }
  return values;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);

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

export async function readStdinWithLimit(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
  timeoutMs: number
): Promise<{ ok: boolean; buffer: Buffer }> {
  const chunks: Buffer[] = [];
  let total = 0;

  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (result: { ok: boolean; buffer: Buffer }) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      cleanup();
      resolve(result);
    };

    const onData = (chunk: Buffer | string) => {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += part.byteLength;
      if (total > maxBytes) {
        // Size cap violation returns a safe empty response upstream.
        finish({ ok: false, buffer: Buffer.alloc(0) });
        return;
      }
      chunks.push(part);
    };

    const onEnd = () => {
      finish({ ok: true, buffer: Buffer.concat(chunks) });
    };

    const onError = () => {
      finish({ ok: false, buffer: Buffer.alloc(0) });
    };

    const cleanup = () => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("error", onError);
    };

    timer = setTimeout(() => {
      finish({ ok: false, buffer: Buffer.alloc(0) });
    }, timeoutMs);

    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("error", onError);
  });
}

function writeResponse(stream: NodeJS.WritableStream, payload: ResponsePayload): Promise<void> {
  return new Promise((resolve) => {
    stream.write(`${formatResponse(payload)}\n`, () => resolve());
  });
}

function emptyResponse(protocolVersion: number): ResponsePayload {
  return {
    protocolVersion,
    values: {}
  };
}

export async function runResolver(runtime: ResolverRuntime = {}): Promise<void> {
  const env = runtime.env ?? process.env;
  const stdin = runtime.stdin ?? processStdin;
  const stdout = runtime.stdout ?? processStdout;
  const config = loadConfig(env);

  const token = env.OP_SERVICE_ACCOUNT_TOKEN?.trim();
  const defaultProtocolVersion = 1;

  const stdinResult = await readStdinWithLimit(stdin, config.maxStdinBytes, config.stdinTimeoutMs);
  if (!stdinResult.ok) {
    await writeResponse(stdout, emptyResponse(defaultProtocolVersion));
    return;
  }

  const request = parseRequestBuffer(stdinResult.buffer, config.maxStdinBytes);
  if (!request) {
    await writeResponse(stdout, emptyResponse(defaultProtocolVersion));
    return;
  }

  const protocolVersion = request.protocolVersion;
  if (!token) {
    await writeResponse(stdout, emptyResponse(protocolVersion));
    return;
  }

  const ids = sanitizeIds(request.ids, config.maxIds, config.allowedIdRegex);
  if (ids.length === 0) {
    await writeResponse(stdout, emptyResponse(protocolVersion));
    return;
  }

  const { refs, refToId } = buildRequestedRefs({
    ids,
    defaultVault: config.defaultVault,
    vaultPolicy: config.vaultPolicy,
    vaultWhitelist: config.vaultWhitelist
  });

  if (refs.length === 0) {
    await writeResponse(stdout, emptyResponse(protocolVersion));
    return;
  }

  try {
    const resolver =
      runtime.resolver ??
      (await createOnePasswordResolver({
        auth: token,
        clientName: config.onePasswordClientName,
        clientVersion: config.onePasswordClientVersion
      }));

    const resolved = await withTimeout(
      resolver.resolveRefs(refs, config.timeoutMs, config.concurrency),
      config.timeoutMs
    );

    const values = mapResolvedValuesToIds(resolved, refToId);

    await writeResponse(stdout, {
      protocolVersion,
      values
    });
  } catch {
    // Any runtime/SDK failure is treated as unresolved to avoid data leakage.
    await writeResponse(stdout, emptyResponse(protocolVersion));
  }
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const exitCode = await runCommandCli(argv, {
    env: process.env,
    runResolver
  });
  process.exitCode = exitCode;
}

export async function runMain(options: {
  run?: (argv?: string[]) => Promise<void>;
  argv?: string[];
  processLike?: { exitCode?: number };
} = {}): Promise<void> {
  const run = options.run ?? runCli;
  const argv = options.argv ?? process.argv.slice(2);
  const processLike = options.processLike ?? process;

  try {
    await run(argv);
    // runCli is responsible for setting successful/expected exit codes.
  } catch {
    processLike.exitCode = 3;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runMain();
}
