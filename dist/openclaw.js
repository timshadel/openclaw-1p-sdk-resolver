import { createHash } from "node:crypto";
import { accessSync, constants as fsConstants, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
export function resolveOpenclawConfigPath(options) {
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
export function collectOpenclawReferences(text) {
    const refs = new Set();
    const pattern = /op:\/\/[^\s"'`]+/g;
    let match = pattern.exec(text);
    while (match) {
        refs.add(match[0]);
        match = pattern.exec(text);
    }
    return [...refs];
}
export function parseOpenclawConfigText(text) {
    try {
        return { parsed: JSON.parse(text) };
    }
    catch {
        try {
            const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
            const withoutLineComments = withoutBlockComments.replace(/^\s*\/\/.*$/gm, "");
            const withoutTrailingCommas = withoutLineComments.replace(/,\s*([}\]])/g, "$1");
            return { parsed: JSON.parse(withoutTrailingCommas) };
        }
        catch {
            return { parseError: "Unable to parse openclaw config JSON." };
        }
    }
}
export function scanRepositoryForSecretCandidates(options) {
    const findings = [];
    const ignoreDirs = new Set([".git", "node_modules", "dist", "coverage", ".pnpm-store", ".turbo"]);
    const maxFiles = options.maxFiles ?? 500;
    const queue = [options.rootDir];
    let scanned = 0;
    while (queue.length > 0 && scanned < maxFiles) {
        const currentDir = queue.shift();
        if (!currentDir) {
            continue;
        }
        let entries;
        try {
            entries = readdirSync(currentDir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const entryPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (!ignoreDirs.has(entry.name)) {
                    queue.push(entryPath);
                }
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            scanned += 1;
            if (scanned > maxFiles) {
                break;
            }
            const size = safeFileSize(entryPath);
            if (size === undefined || size > 1024 * 1024) {
                continue;
            }
            let text;
            try {
                text = readFileSync(entryPath, "utf8");
            }
            catch {
                continue;
            }
            const lines = text.split(/\r?\n/);
            for (let i = 0; i < lines.length; i += 1) {
                const line = lines[i];
                const refMatch = /\bop:\/\/[^\s"'`]+/.exec(line);
                if (refMatch) {
                    findings.push({
                        type: "already_1password",
                        file: entryPath,
                        line: i + 1,
                        key: "op-ref",
                        fingerprint: fingerprint(refMatch[0])
                    });
                }
                const literalRegex = /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API_KEY|PRIVATE_KEY|AUTH)[A-Z0-9_]*)\b\s*[:=]\s*["']?([^"'\s#},]+)["']?/g;
                let literalMatch = literalRegex.exec(line);
                while (literalMatch) {
                    const key = literalMatch[1];
                    const value = literalMatch[2];
                    if (looksLikePlaceholder(value)) {
                        literalMatch = literalRegex.exec(line);
                        continue;
                    }
                    findings.push({
                        type: value.startsWith("op://") ? "already_1password" : "candidate_for_1password",
                        file: entryPath,
                        line: i + 1,
                        key,
                        fingerprint: fingerprint(value)
                    });
                    literalMatch = literalRegex.exec(line);
                }
                const riskyInlineLiteral = /(ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})/.exec(line);
                if (riskyInlineLiteral) {
                    findings.push({
                        type: "risky_literal",
                        file: entryPath,
                        line: i + 1,
                        key: "inline-token",
                        fingerprint: fingerprint(riskyInlineLiteral[1])
                    });
                }
            }
        }
    }
    return findings;
}
export function suggestOpenclawProviderImprovements(options) {
    const suggestions = [];
    const text = options.openclawText ?? "";
    const hasResolverCommand = text.includes("openclaw-1p-sdk-resolver");
    if (!hasResolverCommand) {
        suggestions.push("Add an exec provider that invokes openclaw-1p-sdk-resolver.");
    }
    if (!text.includes("\"jsonOnly\": true")) {
        suggestions.push("Set provider config jsonOnly: true.");
    }
    if (!text.includes("OP_SERVICE_ACCOUNT_TOKEN")) {
        suggestions.push("Include OP_SERVICE_ACCOUNT_TOKEN in passEnv.");
    }
    if (!text.includes("OP_RESOLVER_CONFIG")) {
        suggestions.push("Include OP_RESOLVER_CONFIG in passEnv when using custom resolver config paths.");
    }
    if (options.references.length === 0) {
        suggestions.push("No op:// references found; migrate candidate secrets to 1Password references.");
    }
    return suggestions;
}
function fingerprint(value) {
    const digest = createHash("sha256").update(value).digest("hex");
    return `len=${value.length} sha256=${digest.slice(0, 12)}`;
}
function looksLikePlaceholder(value) {
    const lower = value.toLowerCase();
    if (value.startsWith("${") || value.startsWith("$(") || value.startsWith("<")) {
        return true;
    }
    if (lower.includes("example") || lower.includes("changeme") || lower.includes("placeholder")) {
        return true;
    }
    return value.length < 8;
}
function safeFileSize(filePath) {
    try {
        return statSync(filePath).size;
    }
    catch {
        return undefined;
    }
}
function canRead(filePath) {
    if (!existsSync(filePath)) {
        return false;
    }
    try {
        accessSync(filePath, fsConstants.R_OK);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=openclaw.js.map