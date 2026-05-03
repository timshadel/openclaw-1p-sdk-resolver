---
created: 2026-05-03
status: accepted
---

# ADR-0001: Adopt Repository Governance Lifecycle

## Context

This branch intentionally restarts the repository from the first commit for a Go implementation trial. The branch needs a lightweight governance baseline before implementation work starts so future plans, decisions, and learning records have stable locations and naming rules.

## Decision

- Adopt a lightweight governance lifecycle with live folders `docs/01-ideas/`, `docs/02-research/`, `docs/03-decisions/`, `docs/04-plans/`, `docs/05-insights/`, and `docs/99-archive/`.
- During `repository-governance` audit and remediation work, use the skill's canonical governance semantics to resolve ambiguity unless the repository has an explicit accepted compatible local exception.
- Preserve archived artifacts under matching prefixed archive subfolders: `docs/99-archive/01-ideas/`, `docs/99-archive/02-research/`, `docs/99-archive/03-decisions/`, `docs/99-archive/04-plans/`, and `docs/99-archive/05-insights/`.
- Route documents by intent: ADR = what we decided, Plan = what we are doing right now, ideas capture early thoughts, research reduces uncertainty, and insights preserve execution or operational learning.
- Require `created: YYYY-MM-DD` on all governed docs.
- Governed docs are Markdown documents and may include YAML frontmatter where metadata is required.
- Require ADRs to include `status: proposed | accepted | superseded`.
- When archiving any governed doc, set `status: archived`, move it into the matching archive folder, and do not modify it afterward.
- Archived docs never return to live folders. New work creates a new live document that references the archived predecessor.
- In user-facing governed prose, reference other repo-authored Markdown docs with inline Markdown links that use relative URLs and human-readable link text. Prefer the destination H1 when it reads naturally, and otherwise use a concise prose variant that stays clear in sentence context.
- Prefer prose-embedded links over raw backticked paths or path-only code blocks when pointing readers to another governed doc.
- Keep raw code formatting for literal filenames, path patterns, shell commands, inventories, and non-user-facing internal reference material.
- Use filename patterns `idea-{slug}.md`, `RPT-YYYY-MM-DD-NN-{slug}.md`, `ADR-NNNN-{slug}.md`, `PLN-YYYY-MM-DD-NN-{slug}.md`, and `INS-YYYY-MM-DD-NN-{slug}.md`.
- For research, plans, and insights, treat `NN` as the zero-padded same-day sequence for that document kind.
- When upgrading an existing repository to this rule, derive same-day sequence from the best available creation signal in this order: explicit timestamp metadata, filesystem creation time, filesystem modification time, then stable lexical filename order.
- Use one shared slug recipe: strip diacritics, lowercase, replace `&` with `and`, remove apostrophes, remove the standard stop-word set, replace remaining non-alphanumerics with `-`, collapse repeated `-`, and trim leading and trailing `-`.
- Distinguish host planning from written repository plans and include the repository's Planning And Implementation etiquette in repo-local policy.

## Consequences

- Future non-trivial work starts with a written plan in `docs/04-plans/`.
- Durable choices are recorded as ADRs in `docs/03-decisions/`.
- Terminal-state governance artifacts move to `docs/99-archive/` and stay immutable after archiving.
- This branch has an explicit governance baseline independent of older TypeScript implementation history preserved on the archive branch.
