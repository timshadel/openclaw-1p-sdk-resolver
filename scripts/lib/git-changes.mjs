import { execSync as nodeExecSync } from "node:child_process";

const ZERO_SHA = /^0+$/;

function runListCommand(cmd, execSyncImpl) {
  const out = execSyncImpl(cmd, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return String(out)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function resolveDiffBaseRef(env, fallbackBaseRef = "HEAD~1") {
  const explicit = env.explicitBaseRef?.trim();
  if (explicit) {
    return explicit;
  }

  if (env.githubEventName === "pull_request" && env.githubBaseRef?.trim()) {
    return `origin/${env.githubBaseRef.trim()}`;
  }

  if (env.githubEventName === "push" && env.githubEventBefore?.trim() && !ZERO_SHA.test(env.githubEventBefore.trim())) {
    return env.githubEventBefore.trim();
  }

  return fallbackBaseRef;
}

export function listChangedFiles(baseRef, execSyncImpl = nodeExecSync) {
  let tracked = [];
  try {
    tracked = runListCommand(`git diff --name-only --diff-filter=ACMR ${baseRef}...HEAD`, execSyncImpl);
  } catch {
    if (baseRef === "HEAD~1") {
      try {
        tracked = runListCommand("git diff-tree --no-commit-id --name-only -r HEAD", execSyncImpl);
      } catch {
        tracked = [];
      }
    }
  }

  let untracked = [];
  try {
    untracked = runListCommand("git ls-files --others --exclude-standard", execSyncImpl);
  } catch {
    untracked = [];
  }

  return [...new Set([...tracked, ...untracked])];
}
