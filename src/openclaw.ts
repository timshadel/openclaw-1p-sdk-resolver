import { accessSync, constants as fsConstants, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * OpenClaw config integration helpers.
 * Parses provider config shape, resolves config paths, and builds safe snippet output.
 */
export type OpenclawConfigPathResolution = {
  path?: string;
  source: "flag" | "OPENCLAW_CONFIG_PATH" | "OPENCLAW_STATE_DIR" | "OPENCLAW_HOME" | "HOME" | "homedir" | "unresolved";
  reason: string;
  exists: boolean;
  readable: boolean;
};

export type OpenclawProviderFinding = {
  code:
    | "provider_missing"
    | "provider_kind_mismatch"
    | "provider_json_only_missing"
    | "provider_command_missing"
    | "provider_passenv_missing";
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

export const DEFAULT_OPENCLAW_PROVIDER_ALIAS = "1p-sdk-resolver";

export function resolveOpenclawConfigPath(options: {
  env: NodeJS.ProcessEnv;
  explicitPath?: string;
}): OpenclawConfigPathResolution {
  const explicitPath = options.explicitPath?.trim();
  if (explicitPath) {
    return {
      path: explicitPath,
      source: "flag",
      reason: "Using explicit --path value.",
      exists: existsSync(explicitPath),
      readable: canRead(explicitPath)
    };
  }

  const fromConfigPath = options.env.OPENCLAW_CONFIG_PATH?.trim();
  if (fromConfigPath) {
    return {
      path: fromConfigPath,
      source: "OPENCLAW_CONFIG_PATH",
      reason: "Using OPENCLAW_CONFIG_PATH override.",
      exists: existsSync(fromConfigPath),
      readable: canRead(fromConfigPath)
    };
  }

  const fromStateDir = options.env.OPENCLAW_STATE_DIR?.trim();
  if (fromStateDir) {
    const resolvedPath = path.join(fromStateDir, "openclaw.json");
    return {
      path: resolvedPath,
      source: "OPENCLAW_STATE_DIR",
      reason: "Using OPENCLAW_STATE_DIR/openclaw.json.",
      exists: existsSync(resolvedPath),
      readable: canRead(resolvedPath)
    };
  }

  const fromOpenclawHome = options.env.OPENCLAW_HOME?.trim();
  if (fromOpenclawHome) {
    const resolvedPath = path.join(fromOpenclawHome, "openclaw.json");
    return {
      path: resolvedPath,
      source: "OPENCLAW_HOME",
      reason: "Using OPENCLAW_HOME/openclaw.json.",
      exists: existsSync(resolvedPath),
      readable: canRead(resolvedPath)
    };
  }

  const fromHome = options.env.HOME?.trim();
  if (fromHome) {
    const resolvedPath = path.join(fromHome, ".openclaw", "openclaw.json");
    return {
      path: resolvedPath,
      source: "HOME",
      reason: "Using HOME/.openclaw/openclaw.json.",
      exists: existsSync(resolvedPath),
      readable: canRead(resolvedPath)
    };
  }

  const home = homedir();
  if (home) {
    const resolvedPath = path.join(home, ".openclaw", "openclaw.json");
    return {
      path: resolvedPath,
      source: "homedir",
      reason: "Using os.homedir()/.openclaw/openclaw.json.",
      exists: existsSync(resolvedPath),
      readable: canRead(resolvedPath)
    };
  }

  return {
    source: "unresolved",
    reason: "Unable to resolve OpenClaw config path from environment.",
    exists: false,
    readable: false
  };
}

export function parseOpenclawConfigText(text: string): { parsed?: unknown; parseError?: string } {
  try {
    return { parsed: JSON.parse(text) };
  } catch {
    try {
      const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
      const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, "");
      const withoutTrailingCommas = withoutLineComments.replace(/,\s*([}\]])/g, "$1");
      return { parsed: JSON.parse(withoutTrailingCommas) };
    } catch {
      return { parseError: "Unable to parse openclaw config JSON." };
    }
  }
}

export function buildResolverProviderSnippet(options: {
  commandHint: string;
  providerAlias?: string;
}): {
  secrets: {
    providers: Record<
      string,
      {
        source: "exec";
        command: string;
        jsonOnly: true;
        passEnv: string[];
      }
    >;
  };
} {
  const providerAlias = options.providerAlias?.trim() || DEFAULT_OPENCLAW_PROVIDER_ALIAS;
  return {
    secrets: {
      providers: {
        [providerAlias]: {
          source: "exec",
          command: options.commandHint,
          jsonOnly: true,
          passEnv: ["HOME", "OP_SERVICE_ACCOUNT_TOKEN", "OP_RESOLVER_CONFIG"]
        }
      }
    }
  };
}

export function checkOpenclawProviderSetup(options: {
  parsedConfig: unknown;
  providerAlias?: string;
}): OpenclawProviderCheckResult {
  const findings: OpenclawProviderFinding[] = [];
  const suggestions: string[] = [];
  const providerAlias = options.providerAlias?.trim() || DEFAULT_OPENCLAW_PROVIDER_ALIAS;
  const root = options.parsedConfig as Record<string, unknown> | undefined;
  if (!root || typeof root !== "object") {
    return {
      providerFound: false,
      findings: [
        {
          code: "provider_missing",
          message: "OpenClaw config is not an object with provider entries.",
          path: "secrets.providers"
        }
      ],
      suggestions: ["Ensure openclaw.json contains a secrets.providers entry for the resolver exec provider."]
    };
  }

  const providers = extractProviders(root);
  const provider = providers.find((entry) => {
    const name = cleanString((entry as Record<string, unknown>).name);
    if (name === providerAlias) {
      return true;
    }
    const config = (entry as Record<string, unknown>).config as Record<string, unknown> | undefined;
    const command = cleanString(config?.command);
    return typeof command === "string" && command.includes("openclaw-1p-sdk-resolver");
  }) as Record<string, unknown> | undefined;

  if (!provider) {
    findings.push({
      code: "provider_missing",
      message: `Provider '${providerAlias}' not found in OpenClaw config.`,
      path: "secrets.providers"
    });
    suggestions.push("Add a resolver provider entry using `openclaw-1p-sdk-resolver openclaw snippet`.");
    return {
      providerFound: false,
      findings,
      suggestions
    };
  }

  const source = cleanString(provider.kind);
  if (source !== "exec") {
    findings.push({
      code: "provider_kind_mismatch",
      message: "Provider source should be 'exec'.",
      path: "secrets.providers.<name>.source",
      expected: "exec",
      actual: source ?? provider.kind
    });
  }

  const config = (provider.config ?? {}) as Record<string, unknown>;
  if (config.jsonOnly !== true) {
    findings.push({
      code: "provider_json_only_missing",
      message: "Provider config jsonOnly should be true.",
      path: "secrets.providers.<name>.jsonOnly",
      expected: true,
      actual: config.jsonOnly
    });
  }

  const command = cleanString(config.command);
  if (!command) {
    findings.push({
      code: "provider_command_missing",
      message: "Provider config command is required.",
      path: "secrets.providers.<name>.command",
      expected: "absolute path to openclaw-1p-sdk-resolver",
      actual: config.command
    });
  }

  const passEnv = Array.isArray(config.passEnv) ? config.passEnv.filter((value): value is string => typeof value === "string") : [];
  const required = ["OP_SERVICE_ACCOUNT_TOKEN", "OP_RESOLVER_CONFIG"];
  for (const key of required) {
    if (!passEnv.includes(key)) {
      findings.push({
        code: "provider_passenv_missing",
        message: `Provider config passEnv is missing ${key}.`,
        path: "secrets.providers.<name>.passEnv",
        expected: key,
        actual: passEnv
      });
    }
  }

  if (findings.length > 0) {
    suggestions.push("Use `openclaw-1p-sdk-resolver openclaw snippet` to generate a valid provider block.");
    suggestions.push("Update OpenClaw config manually; this tool does not edit OpenClaw files.");
  }

  return {
    providerFound: true,
    findings,
    suggestions
  };
}

function canRead(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  try {
    accessSync(filePath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function extractProviders(root: Record<string, unknown>): Array<Record<string, unknown>> {
  const secrets = root.secrets as Record<string, unknown> | undefined;
  if (!secrets || typeof secrets !== "object") {
    return [];
  }

  const providers = secrets.providers;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) {
    return [];
  }

  return Object.entries(providers as Record<string, unknown>)
    .filter(([, value]) => !!value && typeof value === "object")
    .map(([name, value]) => {
      const providerObject = value as Record<string, unknown>;
      return {
        name,
        kind: providerObject.source,
        config: {
          command: providerObject.command,
          jsonOnly: providerObject.jsonOnly,
          passEnv: providerObject.passEnv
        }
      };
    });
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
