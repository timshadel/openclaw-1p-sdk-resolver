#!/usr/bin/env node

import fs from "node:fs";

const mode = process.env.QUALITY_GATES_MODE === "enforce" ? "enforce" : "observe";

const ARCHITECTURE_ANCHORS = {
  "src/protocol.ts": "Protocol/config boundary",
  "src/sanitize.ts": "Sanitization and policy helpers",
  "src/onepassword.ts": "Thin 1Password SDK adapter",
  "src/cli.ts": "CLI command surface and diagnostics orchestration",
  "src/openclaw.ts": "OpenClaw config integration helpers",
  "src/resolver.ts": "Resolver orchestration entrypoint"
};

function appendSummary(lines) {
  const text = lines.join("\n") + "\n";
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (out) {
    fs.appendFileSync(out, text, "utf8");
  }
  process.stdout.write(text);
}

function architectureFilesFromReadme(readme) {
  const header = "## Architecture";
  const idx = readme.indexOf(header);
  if (idx < 0) {
    return [];
  }
  const section = readme.slice(idx, idx + 5000);
  return section
    .split("\n")
    .map((line) => line.match(/^-\s+`(src\/[\w.-]+)`/))
    .filter(Boolean)
    .map((match) => match[1]);
}

const readme = fs.readFileSync("README.md", "utf8");
const readmeFiles = new Set(architectureFilesFromReadme(readme));
const expectedFiles = Object.keys(ARCHITECTURE_ANCHORS);

const findings = [];

for (const file of expectedFiles) {
  if (!readmeFiles.has(file)) {
    findings.push(`README Architecture section missing file entry \`${file}\`.`);
  }

  if (!fs.existsSync(file)) {
    findings.push(`Architecture file \`${file}\` does not exist.`);
    continue;
  }

  const content = fs.readFileSync(file, "utf8");
  const headerWindow = content.split("\n").slice(0, 80).join("\n");
  const anchor = ARCHITECTURE_ANCHORS[file];
  if (!headerWindow.includes(anchor)) {
    findings.push(`File \`${file}\` missing comment anchor \`${anchor}\` near file header.`);
  }
}

for (const file of readmeFiles) {
  if (!ARCHITECTURE_ANCHORS[file]) {
    findings.push(`README Architecture section includes untracked file \`${file}\`. Add an anchor rule to check-doc-comment-consistency.`);
  }
}

const lines = [
  "## Docs/Comment Consistency",
  "",
  `- Mode: \`${mode}\``,
  `- Architecture files in README: ${readmeFiles.size}`,
  `- Tracked architecture files: ${expectedFiles.length}`
];

if (findings.length === 0) {
  lines.push("", "- README architecture, source files, and header comments are consistent.");
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
