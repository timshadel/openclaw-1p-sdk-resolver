#!/usr/bin/env node

import fs from "node:fs";
import { listChangedFiles, resolveDiffBaseRef } from "./lib/git-changes.mjs";

const mode = process.env.QUALITY_GATES_MODE === "enforce" ? "enforce" : "observe";
const minLines = Number(process.env.COVERAGE_MIN_LINES ?? "93");
const minBranches = Number(process.env.COVERAGE_MIN_BRANCHES ?? "90");
const summaryPath = process.env.COVERAGE_SUMMARY_PATH ?? "coverage/coverage-summary.json";
const baselinePath = process.env.COVERAGE_BASELINE_PATH ?? "docs/ci/coverage-baseline.json";

function fmt(num) {
  return Number(num).toFixed(2);
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function writeSummary(lines) {
  const summary = lines.join("\n") + "\n";
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (out) {
    fs.appendFileSync(out, summary, "utf8");
  }
  process.stdout.write(summary);
}

const baseRef = resolveDiffBaseRef({
  explicitBaseRef: process.env.COVERAGE_BASE_REF,
  githubEventName: process.env.GITHUB_EVENT_NAME,
  githubBaseRef: process.env.GITHUB_BASE_REF,
  githubEventBefore: process.env.GITHUB_EVENT_BEFORE
});

function getCoverageEntry(summary, file) {
  if (summary[file]) {
    return summary[file];
  }
  if (summary[`./${file}`]) {
    return summary[`./${file}`];
  }
  const normalized = file.replace(/^\.\//, "");
  const key = Object.keys(summary).find((candidate) => {
    if (candidate === "total") {
      return false;
    }
    const clean = candidate.replace(/^\.\//, "");
    return clean === normalized || clean.endsWith(`/${normalized}`);
  });
  return key ? summary[key] : undefined;
}

if (!fs.existsSync(summaryPath)) {
  writeSummary([
    "## Coverage Gate",
    "",
    `- Mode: \`${mode}\``,
    `- ERROR: coverage summary not found at \`${summaryPath}\`.`
  ]);
  process.exit(mode === "enforce" ? 1 : 0);
}

const summary = readJson(summaryPath);
const baseline = fs.existsSync(baselinePath) ? readJson(baselinePath) : null;

const totalLines = Number(summary?.total?.lines?.pct ?? 0);
const totalBranches = Number(summary?.total?.branches?.pct ?? 0);

const failures = [];
const warnings = [];

if (totalLines < minLines) {
  failures.push(`Line coverage ${fmt(totalLines)}% is below threshold ${fmt(minLines)}%.`);
}
if (totalBranches < minBranches) {
  failures.push(`Branch coverage ${fmt(totalBranches)}% is below threshold ${fmt(minBranches)}%.`);
}

if (baseline?.overall) {
  if (totalLines + 0.001 < Number(baseline.overall.lines)) {
    failures.push(
      `Line coverage regressed from baseline ${fmt(baseline.overall.lines)}% to ${fmt(totalLines)}%.`
    );
  }
  if (totalBranches + 0.001 < Number(baseline.overall.branches)) {
    failures.push(
      `Branch coverage regressed from baseline ${fmt(baseline.overall.branches)}% to ${fmt(totalBranches)}%.`
    );
  }
}

const changed = listChangedFiles(baseRef).filter((file) => file.startsWith("src/") && file.endsWith(".ts"));
if (changed.length === 0) {
  warnings.push("No changed TypeScript source files detected for per-file regression checks.");
}

if (baseline?.files) {
  for (const file of changed) {
    const current = getCoverageEntry(summary, file);
    const base = baseline.files[file];
    if (!base) {
      continue;
    }
    if (!current) {
      warnings.push(`No coverage entry found for changed file \`${file}\`.`);
      continue;
    }
    const linePct = Number(current.lines?.pct ?? 0);
    const branchPct = Number(current.branches?.pct ?? 0);
    if (linePct + 0.001 < Number(base.lines)) {
      failures.push(
        `Changed file ${file} line coverage regressed ${fmt(base.lines)}% -> ${fmt(linePct)}%.`
      );
    }
    if (branchPct + 0.001 < Number(base.branches)) {
      failures.push(
        `Changed file ${file} branch coverage regressed ${fmt(base.branches)}% -> ${fmt(branchPct)}%.`
      );
    }
  }
}

const lines = [
  "## Coverage Gate",
  "",
  `- Mode: \`${mode}\``,
  `- Overall lines: **${fmt(totalLines)}%** (min ${fmt(minLines)}%)`,
  `- Overall branches: **${fmt(totalBranches)}%** (min ${fmt(minBranches)}%)`,
  `- Baseline file: \`${baselinePath}\``
];

if (warnings.length > 0) {
  lines.push("", "### Warnings");
  for (const warning of warnings) {
    lines.push(`- ${warning}`);
  }
}

if (failures.length > 0) {
  lines.push("", "### Findings");
  for (const failure of failures) {
    lines.push(`- ${failure}`);
  }
} else {
  lines.push("", "- No coverage findings.");
}

writeSummary(lines);

if (failures.length > 0 && mode === "enforce") {
  process.exit(1);
}
