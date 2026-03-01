#!/usr/bin/env node

import fs from "node:fs";
import { execSync } from "node:child_process";

const mode = process.env.QUALITY_GATES_MODE === "enforce" ? "enforce" : "observe";

function listChangedFiles() {
  const explicit = process.env.GOVERNANCE_BASE_REF;
  const baseRef = explicit || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "");
  const cmd = baseRef
    ? `git diff --name-only --diff-filter=ACMR ${baseRef}...HEAD`
    : "git diff --name-only --diff-filter=ACMR";
  try {
    const out = execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const tracked = out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const untracked = execSync("git ls-files --others --exclude-standard", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    return [...new Set([...tracked, ...untracked])];
  } catch {
    return [];
  }
}

function hasPath(paths, re) {
  return paths.some((p) => re.test(p));
}

function appendSummary(lines) {
  const text = lines.join("\n") + "\n";
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (out) {
    fs.appendFileSync(out, text, "utf8");
  }
  process.stdout.write(text);
}

const changed = listChangedFiles();
const lines = ["## Plan/ADR Governance Gate", "", `- Mode: \`${mode}\``];

if (changed.length === 0) {
  lines.push("- No changed files detected; skipping governance checks.");
  appendSummary(lines);
  process.exit(0);
}

const planSensitive = [
  /^src\/(cli|openclaw|resolver|protocol|onepassword)\.ts$/,
  /^src\/(protocol|sanitize|onepassword|resolver)\//,
  /^README\.md$/,
  /^AGENTS\.md$/
];

const adrSensitive = [
  /^src\/(protocol|onepassword|resolver)\.ts$/,
  /^src\/(protocol|onepassword|resolver)\//,
  /^docs\/adrs\/\d{3}-.+\.md$/,
  /^\.github\/workflows\/.+\.ya?ml$/
];

const requiresPlan = planSensitive.some((re) => hasPath(changed, re));
const requiresAdr = adrSensitive.some((re) => hasPath(changed, re));

const changedPlan = hasPath(changed, /^docs\/plans\/\d{3}-.+\.md$/);
const changedAdr = hasPath(changed, /^docs\/adrs\/\d{3}-.+\.md$/);

const findings = [];
if (requiresPlan && !changedPlan) {
  findings.push("Sensitive changes detected without a numbered plan record update in docs/plans/.");
}
if (requiresAdr && !changedAdr) {
  findings.push("Architecture-sensitive changes detected without a numbered ADR update in docs/adrs/.");
}

lines.push(`- Changed files analyzed: ${changed.length}`);
lines.push(`- Plan required: ${requiresPlan ? "yes" : "no"}`);
lines.push(`- ADR required: ${requiresAdr ? "yes" : "no"}`);

if (findings.length === 0) {
  lines.push("", "- Governance checks passed.");
} else {
  lines.push("", "### Findings");
  for (const finding of findings) {
    lines.push(`- ${finding}`);
  }
}

appendSummary(lines);

if (findings.length > 0 && mode === "enforce") {
  process.exit(1);
}
