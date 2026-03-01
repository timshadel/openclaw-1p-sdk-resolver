import { describe, expect, it } from "vitest";
import { listChangedFiles, resolveDiffBaseRef } from "../scripts/lib/git-changes.mjs";

describe("git change helpers", () => {
  it("prefers explicit base ref", () => {
    const baseRef = resolveDiffBaseRef({
      explicitBaseRef: "origin/release",
      githubEventName: "pull_request",
      githubBaseRef: "main",
      githubEventBefore: "abc123"
    });
    expect(baseRef).toBe("origin/release");
  });

  it("uses origin base branch for pull_request events", () => {
    const baseRef = resolveDiffBaseRef({
      explicitBaseRef: "",
      githubEventName: "pull_request",
      githubBaseRef: "main",
      githubEventBefore: "abc123"
    });
    expect(baseRef).toBe("origin/main");
  });

  it("uses github.event.before for push events", () => {
    const baseRef = resolveDiffBaseRef({
      explicitBaseRef: "",
      githubEventName: "push",
      githubBaseRef: "",
      githubEventBefore: "f".repeat(40)
    });
    expect(baseRef).toBe("f".repeat(40));
  });

  it("falls back to HEAD~1 for zero before sha and local contexts", () => {
    const zeroShaRef = resolveDiffBaseRef({
      explicitBaseRef: "",
      githubEventName: "push",
      githubBaseRef: "",
      githubEventBefore: "0".repeat(40)
    });
    expect(zeroShaRef).toBe("HEAD~1");

    const localRef = resolveDiffBaseRef({
      explicitBaseRef: "",
      githubEventName: "",
      githubBaseRef: "",
      githubEventBefore: ""
    });
    expect(localRef).toBe("HEAD~1");
  });

  it("lists tracked and untracked files and de-duplicates output", () => {
    const commands: string[] = [];
    const fakeExec = (cmd: string): string => {
      commands.push(cmd);
      if (cmd.startsWith("git diff --name-only")) {
        return "src/resolver.ts\nsrc/resolver.ts\nREADME.md\n";
      }
      if (cmd === "git ls-files --others --exclude-standard") {
        return "docs/new.md\n";
      }
      return "";
    };

    const changed = listChangedFiles("origin/main", fakeExec);
    expect(changed).toEqual(["src/resolver.ts", "README.md", "docs/new.md"]);
    expect(commands[0]).toBe("git diff --name-only --diff-filter=ACMR origin/main...HEAD");
  });

  it("falls back to git diff-tree when HEAD~1 diff fails", () => {
    const commands: string[] = [];
    const fakeExec = (cmd: string): string => {
      commands.push(cmd);
      if (cmd.startsWith("git diff --name-only")) {
        throw new Error("no HEAD~1");
      }
      if (cmd === "git diff-tree --no-commit-id --name-only -r HEAD") {
        return "src/protocol.ts\n";
      }
      if (cmd === "git ls-files --others --exclude-standard") {
        return "";
      }
      return "";
    };

    const changed = listChangedFiles("HEAD~1", fakeExec);
    expect(changed).toEqual(["src/protocol.ts"]);
    expect(commands).toContain("git diff-tree --no-commit-id --name-only -r HEAD");
  });
});
