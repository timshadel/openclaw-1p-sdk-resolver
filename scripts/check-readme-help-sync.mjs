#!/usr/bin/env node

import fs from "node:fs";
import { execSync } from "node:child_process";

const mode = process.env.QUALITY_GATES_MODE === "enforce" ? "enforce" : "observe";

function normalizeLine(line) {
  return line
    .replace(/\s+#.*$/, "")
    .replace(/--id\s+[^\s\]]+/g, "--id <id>")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHelpCommands(helpText) {
  return helpText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("openclaw-1p-sdk-resolver"))
    .map(normalizeLine)
    .filter((line) => line !== "openclaw-1p-sdk-resolver")
    .filter(Boolean);
}

function extractReadmeCommands(readme) {
  const marker = "## CLI Commands";
  const idx = readme.indexOf(marker);
  if (idx < 0) {
    return [];
  }
  const section = readme.slice(idx);
  const match = section.match(/```bash\n([\s\S]*?)```/);
  if (!match) {
    return [];
  }
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("openclaw-1p-sdk-resolver"))
    .map(normalizeLine)
    .filter((line) => line !== "openclaw-1p-sdk-resolver")
    .filter(Boolean);
}

function summary(lines) {
  const text = lines.join("\n") + "\n";
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (out) {
    fs.appendFileSync(out, text, "utf8");
  }
  process.stdout.write(text);
}

let helpText = "";
try {
  helpText = execSync("node ./dist/resolver.js --help", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
} catch {
  summary([
    "## README/Help Sync",
    "",
    `- Mode: \`${mode}\``,
    "- ERROR: unable to run `node ./dist/resolver.js --help`. Did `pnpm build` run first?"
  ]);
  process.exit(mode === "enforce" ? 1 : 0);
}

const readme = fs.readFileSync("README.md", "utf8");
const helpCommands = new Set(extractHelpCommands(helpText));
const readmeCommands = new Set(extractReadmeCommands(readme));

const missingFromReadme = [...helpCommands].filter((cmd) => !readmeCommands.has(cmd));
const extraInReadme = [...readmeCommands].filter((cmd) => !helpCommands.has(cmd));

const lines = [
  "## README/Help Sync",
  "",
  `- Mode: \`${mode}\``,
  `- Help commands: ${helpCommands.size}`,
  `- README commands: ${readmeCommands.size}`
];

if (missingFromReadme.length === 0 && extraInReadme.length === 0) {
  lines.push("", "- README CLI command block is in sync with `--help` output.");
  summary(lines);
  process.exit(0);
}

lines.push("", "### Findings");
for (const cmd of missingFromReadme) {
  lines.push(`- Missing in README: \`${cmd}\``);
}
for (const cmd of extraInReadme) {
  lines.push(`- Missing in --help: \`${cmd}\``);
}
summary(lines);

if (mode === "enforce") {
  process.exit(1);
}
