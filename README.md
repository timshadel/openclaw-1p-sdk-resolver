# openclaw-1p-sdk-resolver

OpenClaw exec secrets provider backed by the official 1Password Go SDK.

This branch is a Go implementation trial. It reads OpenClaw exec-provider JSON from stdin, resolves requested IDs through 1Password secret references, and writes protocol JSON to stdout.

## Build

```bash
go build ./cmd/openclaw-1p-sdk-resolver
```

## Release

Tagged releases are built by GoReleaser through GitHub Actions:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Install from Homebrew after a release:

```bash
brew tap timshadel/tools
brew install --cask openclaw-1p-sdk-resolver
```

The release workflow publishes the cask to `timshadel/homebrew-tools`, which backs the `timshadel/tools` tap. Because that tap is a separate repository, the release workflow requires a `TAP_GITHUB_TOKEN` repository secret with write access to `timshadel/homebrew-tools`.

Local release checks:

```bash
goreleaser check
goreleaser release --snapshot --clean
```

The current release config builds macOS archives for `darwin/arm64` and `darwin/amd64`.

## OpenClaw Resolver Mode

No arguments runs resolver mode:

```bash
echo '{"protocolVersion":1,"ids":["MyAPI/token"]}' | ./openclaw-1p-sdk-resolver
```

The resolver returns:

```json
{"protocolVersion":1,"values":{"MyAPI/token":"resolved-secret-value"}}
```

Malformed input, missing auth, invalid IDs, SDK failures, and unresolved refs fail closed by returning valid JSON with an empty or partial `values` map. Unresolved IDs are omitted.

## ID Mapping

- IDs beginning with `op://` are treated as full 1Password secret references.
- Other IDs are mapped under `OP_DEFAULT_VAULT`.

Example:

```text
MyAPI/token -> op://$OP_DEFAULT_VAULT/MyAPI/token
```

## Token Contract

The service account token is selected by name:

```bash
export OP_SERVICE_ACCOUNT_TOKEN_NAME="main"
```

The raw token name is treated as sensitive operational metadata and should not be logged or passed on argv. Runtime commands use this name to read the system keyring item through `github.com/99designs/keyring`:

- service: `openclaw-1p-sdk-resolver`
- account: `tokens/<OP_SERVICE_ACCOUNT_TOKEN_NAME>`

The only command allowed to read token values from env or file is `token`. These inputs are write-only import sources:

```bash
export OP_SERVICE_ACCOUNT_TOKEN="..."
# or
export OP_SERVICE_ACCOUNT_TOKEN_FILE="/path/to/token-file"
```

Exactly one token value source must be set for `token`. Resolver mode and `doctor` reject `OP_SERVICE_ACCOUNT_TOKEN` and `OP_SERVICE_ACCOUNT_TOKEN_FILE` when either variable is present.

Import is dry run by default:

```bash
openclaw-1p-sdk-resolver token
openclaw-1p-sdk-resolver token --write
openclaw-1p-sdk-resolver token --write --force
```

Existing keyring items fail unless `--force` is provided. The command never prints the token or raw token name. It may print token SHA256, token last 3 chars, and a keyring account fingerprint.

`doctor` verifies the runtime path:

```bash
openclaw-1p-sdk-resolver doctor
openclaw-1p-sdk-resolver doctor --sdk
```

`doctor --sdk` creates a 1Password SDK client with the keyring token and performs a coarse vault-list auth check without printing vault names, counts, or secret refs.

Do not commit service account tokens, `.env` files containing tokens, or command transcripts that include resolved secret values.

## CLI Commands

```text
openclaw-1p-sdk-resolver
openclaw-1p-sdk-resolver help
openclaw-1p-sdk-resolver version
openclaw-1p-sdk-resolver token [--write] [--force] [--json]
openclaw-1p-sdk-resolver doctor [--sdk] [--json]
```

## Development

```bash
go test ./...
go test -race ./...
go vet ./...
```

## Governance Lifecycle

This repository keeps durable governance and process policy in repo-local documents rather than in external agent instructions. During `repository-governance` audit and remediation work, the skill's canonical governance semantics govern ambiguity resolution unless this repository has an explicit accepted compatible local exception.

- `docs/01-ideas/` stores raw, intentionally lightweight thoughts and seeds.
- `docs/02-research/` stores forward-looking investigation, option comparison, uncertainty reduction, and external research.
- `docs/03-decisions/` stores durable decisions, typically ADRs.
- `docs/04-plans/` stores implementation intent for work being done now or about to begin now.
- `docs/05-insights/` stores backward-looking learning, debugging takeaways, operational lessons, and retrospectives.
- `docs/99-archive/` stores terminal-state artifacts and preserves them under matching prefixed archive subfolders.

Document routing is strict:

- ADR = what we decided.
- Plan = what we are doing right now.
- Ideas are early and lightweight.
- Research reduces uncertainty before a decision.
- Insights preserve what execution or operations taught us.

Archived docs never return to live folders. When moving a governed doc into the archive, set `status: archived`, move it under the matching archive folder, and do not modify it afterward. New work creates a new live doc that references the archived predecessor.

All governed docs include `created: YYYY-MM-DD`. ADRs also include `status: proposed | accepted | superseded`.

Governed docs are Markdown documents and may include YAML frontmatter wherever the governance contract requires metadata.

In user-facing governed prose, reference other repo-authored Markdown docs with inline Markdown links that use relative URLs and human-readable link text. Prefer the destination H1 when it reads naturally, and otherwise use a concise prose variant that stays clear in sentence context.

Prefer prose-embedded links over raw backticked paths or path-only code blocks when pointing readers to another governed doc.

Keep raw code formatting for literal filenames, path patterns, shell commands, inventories, and non-user-facing internal reference material.

Plans may optionally include `governance_audit: remediation-plan` when they establish the repository's post-audit governance baseline. Future governance audits should treat the newest such plan as the cutoff for historical-format drift in older plans, insights, and similar closed execution records, but not for live governing docs.

Use these filename patterns:

- `idea-{slug}.md`
- `RPT-YYYY-MM-DD-NN-{slug}.md`
- `ADR-NNNN-{slug}.md`
- `PLN-YYYY-MM-DD-NN-{slug}.md`
- `INS-YYYY-MM-DD-NN-{slug}.md`

For research, plans, and insights, `NN` is the zero-padded same-day sequence for that document kind. When upgrading an existing repository to this rule, derive same-day sequence from the best available creation signal in this order: explicit timestamp metadata, filesystem creation time, filesystem modification time, then stable lexical filename order.

Use one slug recipe across all governed docs: strip diacritics, lowercase, replace `&` with `and`, remove apostrophes, remove stop words, replace remaining non-alphanumerics with `-`, collapse repeated `-`, and trim leading and trailing `-`.

## Planning And Implementation

- Before starting implementation, check whether the working directory is clean.
- If the working directory is not clean, pause and tell the user.
- Do not begin implementation until the user explicitly chooses one of these three paths:
  - checkpoint the current changes
  - treat the current changes as part of the approved work
  - proceed intentionally with a dirty working directory
- If the active runtime provides a structured human-response or multiple-choice UI, prefer that UI for the same three dirty-worktree choices. Otherwise, ask the same three dirty-worktree choices in plain text.
- If the active runtime supports a planning stage with structured human approval, perform the dirty-worktree decision during that planning stage when practical.
- If the user chooses to checkpoint the current changes, use the `git-workflow` skill to create cohesive commits until the working directory is clean.
- Host planning and written repository plans are not the same thing.
- A written repository plan is required before implementation for non-trivial changes.
- A written repository plan is not required for trivial changes.
- Treat a change as non-trivial when it materially affects user-visible behavior or UI, introduces or materially changes a public interface or command surface, spans multiple files or subsystems in a way that benefits from sequencing, introduces migration or rollback concerns, or otherwise requires documented implementation intent.
- Treat a change as trivial when it is narrowly scoped and does not materially change user-visible behavior, public interfaces, or implementation scope.
- If the threshold is unclear, ask whether the work should be treated as trivial or non-trivial rather than defaulting to a written repository plan.
- Planning in the host does not by itself require saving a written repository plan.
- When the agent determines that work is trivial under this policy, it should say so and proceed without creating a durable plan record.
- When a written repository plan is required, the first implementation step must be to save that plan as a Markdown document under `docs/04-plans/` using the naming rules for plans.
- After the plan file is saved, implementation work may begin.
- Every written repository plan must direct the agent to use the `git-workflow` skill as often as prudent to create semantically cohesive commits during implementation.
- A written repository plan may be completed in one commit or in multiple commits, depending on the natural shape of the work.
- A written repository plan is complete when its intended implementation and required validation are finished, the completed work has been committed, and the working directory is clean.
- Git actions must run in series and never in parallel because concurrent Git operations create avoidable lock conflicts and unnecessary user-facing failures.
- The last implementation step in every written repository plan must be to use the `git-workflow` skill to finish committing the work completed for that plan and leave the working directory clean.
- After a written repository plan is complete, additional trivial follow-up work may proceed without reopening the completed plan or creating a new plan.
- Create a new written repository plan for follow-up work only when that follow-up work is itself non-trivial.
