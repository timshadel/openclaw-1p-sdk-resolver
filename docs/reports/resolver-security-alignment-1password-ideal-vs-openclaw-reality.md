# Resolver Security Alignment: 1Password Ideal vs OpenClaw Reality

## Sources accessed (all accessed 2026-03-01)

### 1Password (primary)
- `https://1password.com/blog/where-mcp-fits-and-where-it-doesnt` — “Securing the agentic future: Where MCP fits and where it doesn’t” (July 16, 2025). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  
- `https://developer.1password.com/docs/sdks/ai-agent/` — “Tutorial: Integrate 1Password SDKs with AI agents” (Developer docs; page includes “Security notice”). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  
- `https://1password.com/blog/service-accounts-sdks-agentic-ai` — “Use 1Password service accounts and SDKs to secure agentic AI access” (April 22, 2025). ([1password.com](https://1password.com/blog/service-accounts-sdks-agentic-ai))  
- `https://1password.com/blog/extended-access-management-for-ai-agents` — “Extended Access Management for AI agents” (April 22, 2025). ([1password.com](https://1password.com/blog/extended-access-management-for-ai-agents))  
- `https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai` — “The security principles guiding 1Password’s approach to AI” (Aug 7, 2025). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  

### 1Password (secondary background used only for support)
- `https://1password.com/blog/closing-the-credential-risk-gap-for-browser-use-ai-agents` — “Closing the credential risk gap for AI agents using a browser” (Oct 8, 2025). ([1password.com](https://1password.com/blog/closing-the-credential-risk-gap-for-browser-use-ai-agents))  
- `https://1password.com/blog/security-advisory-for-ai-assisted-browsing-with-the-1password-browser` — “Security advisory for AI-assisted browsing…” (Jan 30, 2026). ([1password.com](https://1password.com/blog/security-advisory-for-ai-assisted-browsing-with-the-1password-browser))  

### OpenClaw (docs + primary operational artifacts)
- `https://docs.openclaw.ai/gateway/secrets` — “Secrets Management” (SecretRef contract, exec provider, runtime snapshot, migration workflow, one-way policy). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- `https://docs.openclaw.ai/cli/secrets` — `openclaw secrets` CLI (reload/audit/configure/apply; exit codes; no partial activation). ([docs.openclaw.ai](https://docs.openclaw.ai/cli/secrets))  
- `https://docs.openclaw.ai/gateway/security` — “Security” (identity/scope/model guidance). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/security))  
- `https://docs.openclaw.ai/cli/security` — `openclaw security` audit notes (personal-assistant default trust model; multi-user heuristic; hardening guidance). ([docs.openclaw.ai](https://docs.openclaw.ai/cli/security))  
- `https://docs.openclaw.ai/gateway/sandboxing` — Sandboxing overview (tool policy precedence; elevated escape hatch). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/sandboxing))  
- `https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated` — Sandbox/tool policy interaction + “sandbox explain” inspector. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated))  
- `https://docs.openclaw.ai/tools` — Tool allow/deny + tool profiles. ([docs.openclaw.ai](https://docs.openclaw.ai/tools))  
- `https://docs.openclaw.ai/tools/exec` — Exec tool (explicit note: sandboxing off by default; fail-closed behavior). ([docs.openclaw.ai](https://docs.openclaw.ai/tools/exec))  
- `https://docs.openclaw.ai/concepts/agent-workspace` — Workspace vs sandbox workspace location and behavior. ([docs.openclaw.ai](https://docs.openclaw.ai/concepts/agent-workspace))  
- `https://docs.openclaw.ai/gateway` — Gateway runbook (runtime model; default loopback bind; auth required by default). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway))  
- `https://docs.openclaw.ai/gateway/doctor` — Doctor checks (security warnings; gateway auth checks; sandbox image repair; etc.). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/doctor))  
- `https://docs.openclaw.ai/cli/doctor` — `openclaw doctor` CLI overview. ([docs.openclaw.ai](https://docs.openclaw.ai/cli/doctor))  
- `https://docs.openclaw.ai/logging` — Log locations + formats (default `/tmp/openclaw/...`). ([docs.openclaw.ai](https://docs.openclaw.ai/logging))  
- `https://docs.openclaw.ai/tools/multi-agent-sandbox-tools` — Multi-agent sandbox/tool restrictions overview. ([docs.openclaw.ai](https://docs.openclaw.ai/tools/multi-agent-sandbox-tools))  
- `https://docs.openclaw.ai/gateway/protocol` — Gateway protocol capability claims + allowlists (caps/commands/permissions). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/protocol))  
- `https://docs.openclaw.ai/start/showcase` — Showcase item mentioning “Beeper local MCP API”. ([docs.openclaw.ai](https://docs.openclaw.ai/start/showcase))  
- `https://docs.openclaw.ai/reference/AGENTS.default` — Default agent/session behavior (main session collapse; groups isolated). ([docs.openclaw.ai](https://docs.openclaw.ai/reference/AGENTS.default))  
- `https://docs.openclaw.ai/gateway/local-models` — Local models note referencing prompt injection risk. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/local-models))  
- `https://docs.openclaw.ai/gateway/configuration` — Config file location + “safe defaults” statement. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/configuration))  

### Resolver project (repo)
- `https://github.com/timshadel/openclaw-1p-sdk-resolver` — repo root/README content embedded in GitHub page (features, architecture overview, security notes, OpenClaw snippet generator). ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver))  

---

## 1) Executive Summary (≤ ~400 words)

1Password’s “ideal future” for agentic AI is built around **access without exposure**: credentials should be **injected** (or mediated by a broker) so that **raw secrets never enter the LLM context**, and authorization remains **deterministic, auditable, least-privilege, and revocable**—with human-visible approval flows for sensitive access. It explicitly draws a boundary: **MCP is not a secrets transport**, and 1Password will not expose raw credentials via MCP. ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))

OpenClaw’s current model is a **practical gateway/runtime**: it supports secret refs but still fundamentally resolves secrets into an **in-memory runtime snapshot** at activation time (fail-fast on startup, atomic reload, “last-known-good” retention), and uses policy (tool allow/deny, sandboxing modes, multi-agent profiles) to limit blast radius under prompt injection. However, it also explicitly assumes a **personal-assistant trust model by default**, and notes that sandboxing can be **off by default**—meaning the secure posture is achievable but not automatic. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))

Resolver sits between these: it is an **OpenClaw exec secrets provider** that uses the **official 1Password JS SDK** with a **service account token**, enforces **vault/ID policy**, and aims to **fail closed** with careful logging hygiene. Practically, it improves “secrets at rest” (no plaintext in config) and keeps resolution deterministic (not MCP), but it still results in secrets existing in the **OpenClaw process memory** (runtime snapshot), which is *not* the same as 1Password’s “no exposure even under compromise” aspiration. ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver))

Shortest path to closest alignment:
- **Now (Phase 0):** Harden Resolver defaults and documentation *and* ship an OpenClaw hardening profile (tools profile/deny + sandboxing “all”) that prevents the agent from accessing secret-bearing surfaces (filesystem, exec, logs).  
- **Near-term (Phase 1):** Add minimal upstream OpenClaw improvements for “sensitive exec provider” handling (zero logging of stdout/stderr, stronger redaction + audit events).  
- **Target (Phase 2):** Move toward a broker/injection model: credentials are **used without being returned** to agent runtime, matching 1Password’s “access without exposure” direction.

---

## 2) “1Password Position” (structured)

### 2.1 `where-mcp-fits-and-where-it-doesnt` — Ideal future boundary-setting (accessed 2026-03-01)
Source: `https://1password.com/blog/where-mcp-fits-and-where-it-doesnt` ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))

**Thesis (1–2 sentences)**  
MCP is valuable for *structured, lower-risk data access*, but **credentials/secrets must not flow through non-deterministic, LLM-driven channels**; authentication should be deterministic and auditable. ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))

**Explicit “do / don’t” rules (claims, not vibes)**  
- **Don’t** exchange credentials/secrets over “a non-deterministic channel driven by an AI agent or LLM” (section: “Mixing these two modes…” and “Why we will not expose raw credentials via MCP”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  
- **Do** keep “access… tightly controlled” and least-privilege “by design” (section: intro boundaries; accessed 2026-03-01). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  
- **Do** use MCP for “high value to the agent, low risk to the organization” contextual metadata (section: “MCP is powerful for the right use cases”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  
- **Don’t** expose “raw credentials or secrets” via MCP; 1Password draws a “firm line” (section: “Why we will not expose raw credentials via MCP”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  

**Stated threat model assumptions**  
- Agent behavior is non-deterministic; credentials in LLM context are vulnerable to **prompt injection/hidden tool instructions** causing exfiltration (section: “Why we will not expose…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  
- Once secrets are in context, revocation is weak because agents may cache/store/share them (section: “Why we will not expose…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  
- They want a model where secrets remain secure “even if systems are compromised,” and they claim MCP server delivery can’t meet that bar (section: “Why we will not expose…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  

**MCP-specific guidance**  
- Keep OAuth-style authorization separate from MCP data flows; do not conflate authentication with LLM-mediated tool/data exchange (section: intro + OAuth mention; accessed 2026-03-01). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  

**Recommended architecture patterns**  
- **Access without exposure:** inject credentials on behalf of the agent when possible (section: “A better way”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  
- Human users explicitly authorize sensitive access; if credentials must be delivered, they should be **short-lived, revocable, minimum privilege, and auditable** (section: “A better way”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  

---

### 2.2 `sdks/ai-agent/` — Compromise / practical guidance for today (accessed 2026-03-01)
Source: `https://developer.1password.com/docs/sdks/ai-agent/` ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))

**Thesis**  
Using SDKs to fetch secrets at runtime for an “agent workflow” is possible, but **not the recommended integration approach**; avoid exposing raw credentials to the AI model and enforce least privilege + auditing. ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))

**Explicit “do / don’t” rules**  
- **Don’t** pass raw credentials into the AI model; “where possible, avoid passing secrets to the model” (section: “Security notice”; accessed 2026-03-01). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  
- **Do** use “short-lived, tightly scoped tokens,” “strong auditing practices,” and minimize the model’s access to sensitive data (section: “Security notice”; accessed 2026-03-01). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  
- **Do** implement least privilege by scoping a service account to a dedicated vault and minimal permissions (section: “Part 1: Set up a 1Password Service Account scoped to a vault”; accessed 2026-03-01). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  
- **Do** keep a boundary by defining secret reference URIs in **non-dynamic controller code** so “the agent… [can’t] craft its own requests to 1Password” (section: “Part 2: Provide your credentials to the agent”; accessed 2026-03-01). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  

**Threat model assumptions**  
- Raw credentials in the model context carry “significant risks” (section: “Security notice”; accessed 2026-03-01). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  
- Guardrails must prevent agents from requesting arbitrary secrets (controller-code boundary) (section: “Part 2…”; accessed 2026-03-01). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  

**MCP guidance**  
- This page does not provide MCP-specific guidance; it links back to “Securing the Agentic Future” blog for philosophy (section: “Security notice”; accessed 2026-03-01). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  

**Architecture pattern**  
- **Service account token** (exported to `OP_SERVICE_ACCOUNT_TOKEN`) + **secret reference URIs** + `secrets.resolve()` at runtime (sections: “Part 1” and “Part 2”; accessed 2026-03-01). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  
- **Auditability:** ability to see what items the service account accesses (section: tutorial intro; accessed 2026-03-01). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  

---

### 2.3 `service-accounts-sdks-agentic-ai` — Pattern + guardrails framing (accessed 2026-03-01)
Source: `https://1password.com/blog/service-accounts-sdks-agentic-ai` ([1password.com](https://1password.com/blog/service-accounts-sdks-agentic-ai))

**Thesis**  
Agentic AI needs “secure, time-bound, and auditable access” instead of insecure workarounds; service accounts + SDKs provide scoped runtime access and audit trails. ([1password.com](https://1password.com/blog/service-accounts-sdks-agentic-ai))

**Explicit “do / don’t” rules**  
- **Don’t** rely on insecure workarounds like hardcoded credentials or disabling MFA; it’s “unsafe and unsustainable” (section: intro problem statement; accessed 2026-03-01). ([1password.com](https://1password.com/blog/service-accounts-sdks-agentic-ai))  
- **Do** isolate credentials in a dedicated vault permissioned for the task, and create a service account token with read-only access (section: “Built-in guardrails…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/service-accounts-sdks-agentic-ai))  
- **Do** fetch credentials at runtime using secret reference URIs via SDKs, rather than embedding secrets in code (section: “Secure secrets at runtime…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/service-accounts-sdks-agentic-ai))  
- **Do** rely on audit logs (“Activity Log”) to track when secrets are accessed and by which service account (section: “Built-in guardrails…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/service-accounts-sdks-agentic-ai))  

**Threat model assumptions**  
- Agents touch multiple systems and require real credentials; without guardrails this creates significant risk (section: “Why Agentic AI needs new access controls”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/service-accounts-sdks-agentic-ai))  

**MCP guidance**  
- This post doesn’t focus on MCP; it frames agentic access as identity/secrets management (accessed 2026-03-01). ([1password.com](https://1password.com/blog/service-accounts-sdks-agentic-ai))  

**Architecture pattern**  
- Vault isolation + service account + runtime retrieval + dynamic rotation (update secrets centrally without changing agent logic) (section: guardrails; accessed 2026-03-01). ([1password.com](https://1password.com/blog/service-accounts-sdks-agentic-ai))  

---

### 2.4 `extended-access-management-for-ai-agents` — Governance + identity narrative (accessed 2026-03-01)
Source: `https://1password.com/blog/extended-access-management-for-ai-agents` ([1password.com](https://1password.com/blog/extended-access-management-for-ai-agents))

**Thesis**  
Traditional IAM assumes humans; AI agents create blind spots, poor governance, and weak revocation. Extended Access Management is positioned to provide visibility and control for agent authentication/access events. ([1password.com](https://1password.com/blog/extended-access-management-for-ai-agents))

**Explicit “do / don’t” rules**  
- **Don’t** use hardcoded credentials, shared secrets, disabled MFA, or sensitive environment variables as shortcuts for agents (section: “The access management challenges…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/extended-access-management-for-ai-agents))  
- **Do** ensure agent access is secure, monitored, and compliant; maintain visibility and governance; enable revocation (sections: “Why AI agents pose a security risk” + bullet list; accessed 2026-03-01). ([1password.com](https://1password.com/blog/extended-access-management-for-ai-agents))  

**Threat model assumptions**  
- Agents may operate “without oversight,” creating security blind spots and compliance issues; revocation is hard when agents are compromised (sections: “Why AI agents pose a security risk” and subsequent bullets; accessed 2026-03-01). ([1password.com](https://1password.com/blog/extended-access-management-for-ai-agents))  

**MCP guidance**  
- No MCP-specific guidance in this post (accessed 2026-03-01). ([1password.com](https://1password.com/blog/extended-access-management-for-ai-agents))  

**Architecture patterns**  
- Not a technical blueprint; the emphasis is **identity governance + visibility + control** for agent access (section: “How … helps secure AI agents”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/extended-access-management-for-ai-agents))  

---

### 2.5 `security-principles-guiding-...-ai` — Ideal principles (accessed 2026-03-01)
Source: `https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai` ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))

**Thesis**  
1Password’s AI posture is anchored in **zero-knowledge, deterministic authorization, no secrets in LLM context, auditability, transparency, and least-privilege by default**, with usability treated as a co-requirement. ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))

**Explicit “do / don’t” rules**  
- **Do** preserve zero-knowledge/end-to-end encryption for any credential interaction (“Secrets stay secret”) (section: “Secrets stay secret”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  
- **Don’t** let LLMs make authorization decisions (“LLMs are not authorization engines”) (section: “Authorization must be deterministic…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  
- **Do** keep credential exchange in a deterministic flow (OAuth auth channel or a dedicated credentials broker) and show users deterministic auth prompts (section: “Authorization must be deterministic…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  
- **Don’t** allow raw credentials into prompts/embeddings/fine-tuning (“Raw credentials should never enter the LLM context”) (section: “Raw credentials…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  
- **Do** log/audit every credential access with contextual detail (“Auditability must be taken into account”) (section: “Auditability…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  
- **Do** enforce least privilege + minimum exposure (scope, duration, context; “No broad, persistent access”) (section: “Least privilege…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  

**Threat model assumptions**  
- LLM inference environments are untrusted; context windows/memory are open-ended; secrets in context risk unintended retention and leakage (section: “Raw credentials…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  
- User deception risk: in-chat prompts are “multi-interpretable”; authorization must be system-level and explicit (section: deterministic auth prompt example; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  

**MCP guidance**  
- Credential exchange must not occur over MCP data channel; use OAuth auth channel or other deterministic mechanism (example in deterministic authorization section; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  

**Architecture patterns**  
- Dedicated credentials broker / deterministic auth prompt; session/time-bound authorization; secure-by-default UX (sections: “Authorization must be deterministic…” + “Security and usability…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  

---

## 3) “OpenClaw Security Posture” (structured)

### 3.1 High-level trust model and threat assumptions (accessed 2026-03-01)
OpenClaw explicitly recommends a security posture ordering: **Identity first → Scope next → Model last**, and assumes “the model can be manipulated,” so design should limit blast radius (section: `gateway/security`; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/security))

Observable posture signals:
- OpenClaw’s security audit emits `security.trust_model.multi_user_heuristic` when config looks like shared-user ingress and explicitly says OpenClaw is a **personal-assistant trust model by default**; for shared-user setups, guidance is to **sandbox all sessions**, keep filesystem access workspace-scoped, and keep personal/private identities/credentials off that runtime (section: `cli/security`; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/cli/security))  
- OpenClaw’s local-model guidance warns that prompt injection defenses matter, and small/quantized models can increase prompt-injection risk (section: `gateway/local-models`; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/local-models))  

### 3.2 Secrets management model (what exists today) (accessed 2026-03-01)
OpenClaw supports “additive secret references” so credentials need not be plaintext in config, but plaintext still works; secret refs are optional (section: `gateway/secrets` “Secrets management”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))

**Core properties (observable):**
- Secrets resolve into an **in-memory runtime snapshot**; resolution is **eager during activation** (not lazy) (section: “Goals and runtime model”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- Gateway startup **fails fast** if any referenced credential can’t be resolved; reload uses **atomic swap** (“full success or keep last-known-good”); runtime reads from active snapshot (section: “Goals and runtime model”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- Activation triggers include startup, config reload paths, and manual `secrets.reload`; reload failure keeps last-known-good snapshot and can enter a “degraded secrets state” with specific codes (sections: “Activation triggers” + “Degraded and recovered operator signals”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  

**SecretRef contract / provider model:**
- One object shape: `{ source: "env" | "file" | "exec", provider: "...", id: "..." }` with validation patterns per source (section: “SecretRef contract”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- Exec provider executes an absolute binary path **without a shell**; default disallows symlink command paths unless explicitly allowed (with `trustedDirs` guidance); supports timeout/output limits/env allowlist and `jsonOnly` mode (section: “Exec provider”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  

**Migration + hygiene controls:**
- `openclaw secrets audit` detects plaintext at rest across `openclaw.json`, `auth-profiles.json`, and `.env`, plus unresolved refs, precedence shadowing, and legacy residues (section: `gateway/secrets` “secrets audit” and `cli/secrets`; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- `secrets configure/apply` defaults to scrubbing migrated plaintext residues from `auth-profiles.json`, legacy `auth.json`, and `.env` (section: `gateway/secrets` “secrets configure” + `cli/secrets`; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- “One-way safety policy”: OpenClaw intentionally does **not** write rollback backups that contain pre-migration plaintext secret values; it relies on preflight + runtime activation validation + atomic file replacement (section: “One-way safety policy”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  

### 3.3 Tool permissions + sandboxing (blast-radius controls) (accessed 2026-03-01)
**Tool allow/deny:**  
- Tools can be globally allowed/denied via `tools.allow` / `tools.deny` (“deny wins”), preventing disallowed tools from being sent to model providers (section: `tools` “Disabling tools”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/tools))  
- `tools.profile` provides base allowlists (minimal/coding/messaging/full) and can be overridden per agent (section: `tools` “Tool profiles”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/tools))  

**Sandboxing:**  
- Sandboxing modes include `"off"`, `"non-main"`, and `"all"` (section: `gateway/sandbox-vs-tool-policy-vs-elevated`; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated))  
- Tool policy applies before sandbox rules; sandboxing doesn’t re-enable denied tools; `tools.elevated` is an explicit escape hatch that runs `exec` on the host (section: `gateway/sandboxing`; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/sandboxing))  
- When sandboxing is enabled and `workspaceAccess` is not `"rw"`, tools run inside a sandbox workspace under `~/.openclaw/sandboxes` rather than the host workspace (section: `concepts/agent-workspace`; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/concepts/agent-workspace))  

**Notable default:**  
- The exec tool documentation explicitly states: “sandboxing is off by default” (section: `tools/exec`; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/tools/exec))  

### 3.4 Operational controls and diagnostics (accessed 2026-03-01)
- Gateway runs as “one always-on process” with a single multiplexed port; defaults bind to loopback; auth is required by default via config or env (section: `gateway` “Runtime model”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway))  
- `openclaw doctor` includes security warnings (e.g., providers open to DMs without allowlist, dangerous policy), gateway auth checks, sandbox image repair, etc. (section: `gateway/doctor`; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/doctor))  
- Logging writes file logs (JSONL) and console output; default rolling file under `/tmp/openclaw/openclaw-YYYY-MM-DD.log` (section: `logging`; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/logging))  

### 3.5 Strong vs permissive (neutral assessment)

**Strong / security-positive properties**
- Deterministic, eager secret resolution into runtime snapshot with fail-fast startup and atomic reload; provider outages moved off request path (secrets doc; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- Exec secrets provider has strong “how to execute” controls: absolute path, no shell, symlink restrictions, trusted directories, env allowlist, output limits (secrets doc; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- Built-in migration/audit tooling for eliminating plaintext at rest + scrubbing legacy residues, with CI-friendly exit codes (cli/secrets; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/cli/secrets))  
- Explicitly treats the model as manipulable; emphasizes identity and scope gating (security guide; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/security))  

**Permissive / “current reality” constraints**
- Defaults target personal assistant usage; multi-user ingress is treated as a heuristic/hardening case, not the default posture (cli/security; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/cli/security))  
- Sandboxing being “off by default” means many deployments may run tools on the host unless explicitly configured (tools/exec; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/tools/exec))  
- Plaintext secrets remain supported (“Plaintext still works. Secret refs are optional”), so secure posture depends on operator adoption (secrets doc; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  

### 3.6 Potential “stated vs default” mismatch (as visible)
OpenClaw documentation says missing config uses “safe defaults,” but other docs explicitly note sandboxing can be off by default and personal-assistant trust model by default. This isn’t “insecure by definition,” but it means safe-by-default is largely about **gateway exposure + auth** rather than about a least-privilege tool/sandbox posture. (Config statement + exec sandbox default + trust model; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/configuration))  

---

## 4) Comparison Matrix (table)

Legend:  
- **1P Ideal** = forward-looking principles/boundaries (`where MCP fits` + AI security principles). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  
- **1P Compromise** = SDK/service-account workflow (“not recommended,” but practical). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  
- **OpenClaw Current** = what docs indicate exists and default assumptions. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- **Resolver Current** = README-described behavior. ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver))  

| Dimension | 1Password Ideal | 1Password Compromise | OpenClaw Current | Resolver Current |
|---|---|---|---|---|
| Identity / auth model | Deterministic auth; LLM not auth engine; prefer broker/OAuth-like flow; human-visible authorization prompt. (AI principles “Authorization must be deterministic”; accessed 2026-03-01) ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai)) | Service account token scoped to vault; token exported via env var; controller code defines secret refs. (SDK tutorial; accessed 2026-03-01) ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/)) | Gateway auth required by default; loopback bind by default. (Gateway runbook; accessed 2026-03-01) ([docs.openclaw.ai](https://docs.openclaw.ai/gateway)) | Uses 1Password service account via official JS SDK; designed as OpenClaw exec secrets provider. (Resolver README; accessed 2026-03-01) ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver)) |
| Secret retrieval mechanism | Prefer “inject without handing over” / broker; do not transport secrets via MCP. (MCP blog “A better way” + “Why we will not…”; accessed 2026-03-01) ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt)) | SDK `secrets.resolve()` using secret reference URIs; avoid passing secrets to model if possible. (SDK tutorial “Security notice”; accessed 2026-03-01) ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/)) | SecretRef providers: env/file/exec; exec provider runs absolute binary with strict controls; resolved into runtime snapshot. (Secrets doc; accessed 2026-03-01) ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets)) | Exec-resolver that maps stdin IDs to 1Password secret reads and emits protocol JSON to stdout; fail-closed posture. (Resolver README; accessed 2026-03-01) ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver)) |
| Authorization granularity | Least privilege, minimum exposure; time-bound scopes; avoid broad/persistent access. (AI principles; accessed 2026-03-01) ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai)) | Vault-scoped service accounts (read-only) + explicit secret refs in controller code prevents arbitrary secret requests. (SDK tutorial; accessed 2026-03-01) ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/)) | Tool allow/deny + tool profiles; multi-agent configs allow different security profiles. (Tools + multi-agent; accessed 2026-03-01) ([docs.openclaw.ai](https://docs.openclaw.ai/tools)) | Enforces vault policy (default-vault style) and ID sanitation per README; provides OpenClaw snippet that encourages `jsonOnly: true` + env allowlist. (Resolver README; accessed 2026-03-01) ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver)) |
| Session/token lifecycle | If credentials delivered, should be short-lived, revocable, minimum privilege; strong auditability. (MCP blog “A better way”; accessed 2026-03-01) ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt)) | Service account tokens are used; tutorial emphasizes least privilege + audit, but does not claim tokens are short-lived. (SDK tutorial; accessed 2026-03-01) ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/)) | Secrets resolved eagerly at activation into in-memory snapshot; reload retains last-known-good on failure; degraded state signals. (Secrets doc; accessed 2026-03-01) ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets)) | Resolver runs per-activation (exec provider) and outputs values; does not describe token rotation; relies on operator to manage service account token lifecycle. (Resolver README; accessed 2026-03-01) ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver)) |
| Boundary control (sandboxing / host access) | Keep secrets out of AI context; enforce deterministic boundaries; minimize exposure by default. (AI principles; accessed 2026-03-01) ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai)) | “Avoid passing secrets to the model” (but still fetches secrets into app memory). (SDK tutorial security notice; accessed 2026-03-01) ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/)) | Sandboxing exists with modes off/non-main/all; tool policy applies before sandbox rules; exec tool notes sandboxing off by default. (Sandbox + exec docs; accessed 2026-03-01) ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated)) | Resolver executes on gateway host as exec provider binary; recommends trustedDirs and no symlink writing; does not itself sandbox. (Resolver README; accessed 2026-03-01) ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver)) |
| Exfiltration risk controls | Do not put raw credentials in prompts/context; prompt injection risk emphasized; “access without exposure.” (MCP blog + AI principles; accessed 2026-03-01) ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt)) | Not recommended approach; warns about raw secrets to model; encourages boundary where agent can’t request arbitrary secrets. (SDK tutorial; accessed 2026-03-01) ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/)) | Tool restrictions + sandboxing used to limit blast radius under manipulation; security guide emphasizes identity/scope before model. (Security + tools; accessed 2026-03-01) ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/security)) | Resolver’s stated posture: do not log secret values, sanitize input, output secrets only in protocol response; fail-closed to avoid partial leakage. (Resolver security notes; accessed 2026-03-01) ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver)) |
| Auditability / governance | Every credential access should leave audit trail; avoid opaque usage; human-meaningful context. (AI principles “Auditability…”; accessed 2026-03-01) ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai)) | Service account usage report / activity log enables tracking what items accessed. (SDK tutorial + service accounts blog; accessed 2026-03-01) ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/)) | Logs written by gateway (JSONL) to `/tmp/...` by default; doctor/security audits highlight risky policy. (Logging + doctor/security; accessed 2026-03-01) ([docs.openclaw.ai](https://docs.openclaw.ai/logging)) | Resolver includes client name/version config fields (for 1Password identification) and a `check` command (per README); however, detailed audit integration is not confirmed without code review. (Resolver README; accessed 2026-03-01) ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver)) |
| Developer ergonomics / default secure | Secure-by-default UX is a co-requirement; minimize user friction while maintaining security prompts. (AI principles; accessed 2026-03-01) ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai)) | Tutorial is hands-on; but explicitly “not recommended integration approach.” (SDK tutorial security notice; accessed 2026-03-01) ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/)) | `secrets configure` + `secrets audit` provide interactive migration and CI gates; “safe defaults” if config missing. (Secrets + config docs; accessed 2026-03-01) ([docs.openclaw.ai](https://docs.openclaw.ai/cli/secrets)) | Resolver provides `openclaw snippet` generator, safe config init, and security notes; however, secure OpenClaw hardening is outside the resolver unless documented. (Resolver README; accessed 2026-03-01) ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver)) |
| Where MCP fits vs doesn’t | MCP acceptable for low-risk metadata; not for raw credentials; deterministic auth separate from data channel. (MCP blog; accessed 2026-03-01) ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt)) | Not MCP-focused. ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/)) | OpenClaw docs mention MCP via “Beeper local MCP API” in showcase; secrets system is env/file/exec, not MCP. (Showcase + secrets docs; accessed 2026-03-01) ([docs.openclaw.ai](https://docs.openclaw.ai/start/showcase)) | Resolver uses OpenClaw exec provider protocol (stdin/stdout JSON), not MCP. (Resolver README; accessed 2026-03-01) ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver)) |

---

## 5) Resolver Assessment

### 5.1 What Resolver does (and what it doesn’t)
Resolver is designed to be an **OpenClaw secrets exec provider** that resolves SecretRef IDs into real secret values by calling the **official 1Password JS SDK**, using **service account auth**. It aims to “fail closed” and to avoid leaking secrets via logs or error details, while providing an OpenClaw JSON config snippet for the exec provider. (Resolver README; accessed 2026-03-01). ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver))

Limitations called out in the README include that it targets OpenClaw’s exec provider in `jsonOnly` mode and does not return per-ID error detail to avoid leaking sensitive information. (Resolver README “Limitations”; accessed 2026-03-01). ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver))

### 5.2 Current architecture diagram (ASCII)

```
            +---------------------+
            |   OpenClaw Gateway  |
            |  (Secrets Activation|
            |   + Runtime Snapshot)|
            +----------+----------+
                       |
                       | SecretRef {source:"exec", provider:"resolver", id:"..."}
                       | (activation-time, eager, fail-fast)
                       v
            +----------+----------+
            | Exec Provider Runner|
            | (no shell, abs path)|
            +----------+----------+
                       |
                       | stdin JSON: { protocolVersion, provider, ids:[...] }
                       v
            +----------+----------+
            |   Resolver Process  |
            | (1Password JS SDK)  |
            +----------+----------+
                       |
                       | 1Password service account token
                       | (from env; retrieved by SDK)
                       v
            +----------+----------+
            |   1Password APIs /  |
            |   Secret Retrieval  |
            +----------+----------+
                       |
                       | stdout JSON: { protocolVersion, values:{id:secret} }
                       v
            +----------+----------+
            | OpenClaw Runtime     |
            | In-memory snapshot   |
            +----------------------+
```

This diagram is consistent with OpenClaw’s exec provider contract (stdin ids → stdout values) and with Resolver’s stated design (stdin JSON protocol, stdout response, 1Password SDK). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))

### 5.3 Trust boundaries introduced/relied upon

**Boundary A — Operator-controlled config vs agent-driven behavior**  
- OpenClaw resolves secrets at activation time from config-specified secret refs into a runtime snapshot (not on-demand per model/tool call). This is *intended* to keep provider outages off hot request paths. (OpenClaw secrets “Goals and runtime model”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- 1Password’s compromise guidance similarly stresses a boundary where secret references are defined in “non-dynamic controller code” so the agent can’t craft arbitrary secret requests. Resolver inherits this because OpenClaw’s activation determines which IDs are requested. (1Password SDK tutorial “Part 2…”; accessed 2026-03-01). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  

**Boundary B — Exec provider execution safety**  
OpenClaw’s exec provider is a security-critical boundary: it runs an absolute binary path, no shell, with restrictions on symlinks and “trustedDirs.” (OpenClaw secrets “Exec provider”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  

Resolver additionally treats its own config and logs as sensitive, emphasizing safe writes and not logging secrets. (Resolver “Security notes”; accessed 2026-03-01). ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver))  

**Boundary C — LLM context vs runtime secrets**  
The key question for 1Password alignment is whether secrets can cross into the LLM context. 1Password says raw secrets should never enter prompts/context. (AI principles; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  
OpenClaw docs describe secrets being used in runtime snapshot and tool policies controlling what tools are exposed to the model provider. (Secrets doc + tools doc; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
**Unknown:** Without reviewing OpenClaw source, we cannot conclusively confirm whether any debug modes/tool outputs might inadvertently include secret values. (See Open Questions.)

### 5.4 Data flow of secrets (where they appear)

Based on OpenClaw and Resolver docs, secrets may appear in these places:

1) **1Password storage** (source of truth): secrets stored in vault; accessed via service account token (1Password service accounts + SDK pattern; accessed 2026-03-01). ([1password.com](https://1password.com/blog/service-accounts-sdks-agentic-ai))  
2) **Resolver process memory**: the SDK retrieves secrets and prepares response JSON (inferred from Resolver “1Password SDK integration” architecture description; accessed 2026-03-01). ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver))  
3) **Resolver stdout**: secrets are present in the exec protocol stdout response payload (`values`), which is explicitly how OpenClaw exec provider works. (OpenClaw secrets “Response payload”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
4) **OpenClaw gateway process memory**: secrets are resolved into an in-memory runtime snapshot and used at runtime. (OpenClaw secrets “Goals and runtime model”; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
5) **Disk (should be minimized):** OpenClaw migration tools attempt to scrub plaintext residues from config/auth/.env, and explicitly avoid rollback backups containing plaintext secrets (“one-way safety policy”). (OpenClaw secrets + CLI secrets; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
6) **Logs / telemetry:** OpenClaw logs to `/tmp/openclaw/...` by default; docs do not explicitly say whether exec provider stdout/stderr is logged. This is a risk area requiring confirmation. (OpenClaw logging doc; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/logging))  

### 5.5 Risk inventory: top 10 realistic risks (ranked impact × likelihood)

> Ranking is based on typical agent/gateway deployments implied by OpenClaw’s “personal assistant” default trust model and by the fact that secrets are delivered to runtime memory, not on 1Password’s “broker” ideal. Where a risk depends on unknown behavior (e.g., logging), it’s marked.

1) **Service account token exposure (env var / process inspection)**  
- Why realistic: SDK tutorial uses `OP_SERVICE_ACCOUNT_TOKEN` env var; resolver likely depends on it. Env vars can leak via diagnostics, crash reports, process listings (varies by OS), or mis-scoped child processes. ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  
- Impact: very high (token can unlock many secrets depending on vault scope).

2) **Secrets written into logs (OpenClaw or resolver), especially via exec provider stdout capture** *(unknown; must verify)*  
- Why realistic: secrets exist in resolver stdout by design (exec provider protocol). If any layer logs stdout/stderr, secrets hit disk (`/tmp/openclaw/...`). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- Impact: very high.

3) **Over-broad 1Password service account scope (vault permissions too wide)**  
- Why realistic: 1Password pattern depends on scoping to a dedicated vault; if not, compromise/exfil expands. ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  
- Impact: high.

4) **Prompt injection → tool misuse → exfiltration** (LLM-specific)  
- Why realistic: OpenClaw security guidance assumes “model can be manipulated” and stresses identity/scope gating. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/security))  
- If tools like `exec`, filesystem, browser, etc. are enabled, an injected prompt can attempt to read configs, environment, logs, or trigger uploads.  
- Impact: high; likelihood depends on tool policy.

5) **Sandboxing disabled (host tool execution by default)**  
- Why realistic: exec tool explicitly notes sandboxing off by default; without sandboxing, any enabled tools run on host with broader access. ([docs.openclaw.ai](https://docs.openclaw.ai/tools/exec))  
- Impact: high.

6) **Exec provider binary substitution / path trust failure**  
- Why realistic: OpenClaw warns about symlink command paths and recommends `trustedDirs`. Misconfiguring `allowSymlinkCommand`/`trustedDirs` could allow running a malicious binary. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- Impact: high.

7) **Secrets remain in memory snapshot longer than necessary**  
- Why realistic: OpenClaw resolves secrets eagerly into runtime snapshot for availability; that increases “secrets-in-memory” duration vs on-demand retrieval. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- Impact: medium-high (process compromise).

8) **Gateway exposure / remote access misconfiguration**  
- Why realistic: gateway defaults are loopback + auth required, but remote gateway/proxy setups exist; misconfig can expose RPC/control UI. Doctor explicitly checks gateway auth presence. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway))  
- Impact: high.

9) **Multi-user ingress without hardening**  
- Why realistic: OpenClaw warns personal-assistant trust model by default and flags multi-user heuristics; if used as shared bot, risk escalates quickly. ([docs.openclaw.ai](https://docs.openclaw.ai/cli/security))  
- Impact: high.

10) **Residual plaintext secrets at rest (partial migrations, `.env`, auth files)**  
- Why realistic: OpenClaw supports plaintext and uses migration tools to scrub, but partial migrations can leave residues; audit tries to detect them. ([docs.openclaw.ai](https://docs.openclaw.ai/cli/secrets))  
- Impact: medium-high.

---

## 6) Alignment Plan (phased)

### Non-negotiables from 1Password guidance (explicit)
These are the constraints Resolver should treat as “policy invariants,” even if OpenClaw cannot fully enforce them:

1) **Raw credentials should never enter the LLM context** (AI principles “Raw credentials…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  
2) **Authorization must be deterministic, not probabilistic**; LLMs are not authorization engines (AI principles “Authorization must be deterministic…”; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  
3) **Do not expose secrets over MCP data channels** (MCP blog; accessed 2026-03-01). ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  
4) **Least privilege and minimum exposure**: scope, duration, context (AI principles; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  
5) **Auditability**: every credential access should leave an audit trail (AI principles; accessed 2026-03-01). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  

### OpenClaw constraints (explicit)
1) Secrets are resolved into an **in-memory runtime snapshot** at activation time; the model is not “on-demand brokered” today (secrets doc; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
2) OpenClaw is a personal-assistant trust model by default; secure multi-user requires explicit configuration (cli/security; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/cli/security))  
3) Sandboxing exists but may be off by default; it must be enabled/configured to reduce blast radius (exec + sandbox docs; accessed 2026-03-01). ([docs.openclaw.ai](https://docs.openclaw.ai/tools/exec))  

### Resolver must guarantee (security invariants)
From Resolver’s role as a bridge, these are the minimum invariants to keep:

- **No secret values in logs** (stdout except protocol response, no debug prints, no raw stdin logging). (Resolver security notes; accessed 2026-03-01). ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver))  
- **Fail closed**: on parse/config/SDK errors, produce an output that causes OpenClaw resolution to fail (or at least not activate new secrets). (Resolver architecture/limitations + OpenClaw activation contract; accessed 2026-03-01). ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver))  
- **Policy enforcement on IDs**: only resolve IDs that match a configured vault policy/allowlist, so misconfig or hostile input can’t pivot to other secrets. (Resolver architecture; accessed 2026-03-01). ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver))  
- **Deterministic channel**: resolver must remain an exec-provider component, not a tool surfaced to LLM (aligns with “LLM not auth engine”). ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  

---

### Phase 0 (now): no upstream OpenClaw code changes

This phase assumes we can change:
- Resolver repo (code/docs/tests)
- Operator configuration (OpenClaw config, 1Password vault/service account setup)
…but not OpenClaw upstream code.

#### 0.A Harden Resolver defaults and documentation for least privilege
**Change**  
- Update Resolver README and `openclaw snippet` output to strongly recommend:  
  - A dedicated 1Password vault for OpenClaw/Resolver secrets.  
  - A service account scoped read-only to that vault.  
  - A strict Resolver config default (`vaultPolicy: default_vault` + deny “any vault” unless explicitly set).  
  - Explicit mention that the SDK tutorial calls this approach “not recommended,” and explain why (it delivers raw secrets into runtime memory). ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  

**Security benefit**  
- Reduces blast radius of token compromise and prevents accidental exposure of broader secret inventory. ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  

**Compatibility impact**  
- Low; users who want multi-vault must set explicit config.

**Effort**  
- S (docs + snippet wording).

**Validate**  
- Add doc-based “configuration recipes” and checklists; ensure snippet generator output contains safe defaults (unit test golden output).

#### 0.B Provide an “OpenClaw hardened profile” recipe (config-only)
**Change** (OpenClaw config guidance in Resolver docs; no OpenClaw code change)
- Recommend enabling sandboxing and minimizing tool exposure for any runtime that holds sensitive credentials:  
  - `agents.defaults.sandbox.mode: "all"` (to avoid “non-main surprise” and ensure consistent isolation). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated))  
  - `tools.profile: "minimal"` (or at least avoid filesystem/exec groups unless required). ([docs.openclaw.ai](https://docs.openclaw.ai/tools))  
  - `tools.deny: ["exec", "group:fs", "browser", "*"]` with explicit allowlist of only required tools (exact tool names depend on OpenClaw tool catalog; this needs care). ([docs.openclaw.ai](https://docs.openclaw.ai/tools))  
  - Avoid `tools.elevated` escape hatch unless an operator approval flow exists. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/sandboxing))  

**Security benefit**  
- Directly supports OpenClaw’s “model can be manipulated” assumption by limiting what the model can cause the runtime to do. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/security))  

**Compatibility impact**  
- Medium: could break workflows relying on exec/fs/browser tools; requires deliberate allowlisting.

**Effort**  
- M (docs + tested config examples; need to ensure tool names match OpenClaw).

**Validate**  
- Use `openclaw sandbox explain --json` to verify effective sandbox mode + tool allow/deny. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated))  
- Run `openclaw security` and ensure it does not flag multi-user heuristics unintentionally. ([docs.openclaw.ai](https://docs.openclaw.ai/cli/security))  

#### 0.C “No logging of secrets” practical mitigations (doc + runtime probes)
**Change**  
- Add a Resolver doc section: treat **stdout/stderr and gateway logs as sensitive**, ensure log level is not set to debug when troubleshooting secrets. (This aligns with Resolver’s own note that protocol output contains secrets.) ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- Add a runtime probe checklist:  
  - Run a controlled secret retrieval, then inspect `/tmp/openclaw/openclaw-YYYY-MM-DD.log` for the secret value (should not appear). ([docs.openclaw.ai](https://docs.openclaw.ai/logging))  
  - If it appears, treat as a critical misconfiguration/bug and stop.  

**Security benefit**  
- Detects one of the highest-impact failures early (secrets at rest in logs).

**Compatibility impact**  
- Low.

**Effort**  
- S.

**Validate**  
- Add integration test in Resolver that intentionally uses a known “canary” value and asserts it never appears in stderr output under failure paths.

#### 0.D Tighten Resolver’s “fail closed” semantics to match OpenClaw activation contract
**Change**  
- Ensure Resolver never outputs partial/ambiguous values that OpenClaw might treat as “present but empty.” Prefer **omitting** unresolved IDs from `values` rather than mapping them to empty strings (if not already). This aligns with OpenClaw’s “startup fails fast if any referenced credential cannot be resolved.” ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  

**Security benefit**  
- Prevents a subtle downgrade where OpenClaw might activate with broken creds and later leak errors or trigger retries.

**Compatibility impact**  
- Low (unless someone relies on empty string as a valid secret, which should be rare).

**Effort**  
- S–M (code + tests; requires code review access).

**Validate**  
- Golden tests for protocol output; integration test with OpenClaw secrets activation (if feasible in CI) verifying startup fails when value missing.

---

### Phase 1 (near-term): minimal OpenClaw changes (flags/config + small upstream PRs)

Goal: reduce the chance that secrets (which *must* exist in OpenClaw memory today) leak into logs/tool outputs, and improve audit context.

#### 1.A Add a “sensitive exec provider” mode (OpenClaw)
**Change (OpenClaw upstream proposal)**  
- Introduce an exec-provider flag, e.g., `secrets.providers.<name>.sensitive: true`, that guarantees:  
  - Exec provider **stdout is never logged** (even at debug).  
  - Provider errors are redacted (no echo of stdout/stderr).  
  - “Doctor” warns if sensitive providers are used while file logging is enabled without redaction.  

**Security benefit**  
- Addresses the highest-impact risk: secret values ending up on disk via logs.  

**Compatibility impact**  
- Low; default false. Some debugging workflows become harder; need safe debug mode that prints only IDs and error codes.

**Effort**  
- M (OpenClaw change + tests).

**Validate**  
- Add regression tests ensuring secret values from exec provider cannot appear in logs; verify with `openclaw logs --follow --json`. ([docs.openclaw.ai](https://docs.openclaw.ai/logging))  

> Note: This proposal is motivated by the fact that exec provider response payload explicitly contains secret values. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  

#### 1.B Emit “secret ref resolution audit events” (OpenClaw)
**Change (OpenClaw upstream proposal)**  
- Emit structured events when secret refs are resolved (provider name + ID count + hash of IDs, **not values**), and when degraded/recovered states occur (already has log codes). ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  

**Security benefit**  
- Improves forensic visibility without exposing secrets, aligning with 1Password’s auditability requirement. ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  

**Compatibility impact**  
- Low.

**Effort**  
- M.

**Validate**  
- Confirm events appear in JSONL logs and Control UI logs without values. ([docs.openclaw.ai](https://docs.openclaw.ai/logging))  

#### 1.C Secrets provider sandboxing (OpenClaw)
**Change (OpenClaw upstream proposal)**  
- Allow exec secret providers to run inside a constrained sandbox (or at least a restricted subprocess environment) with minimal filesystem and environment access, similar in spirit to tool sandboxing. (This is an architectural change; see Phase 2 for stronger version.)

**Security benefit**  
- Limits what a compromised resolver process or dependency chain can access on the host.

**Compatibility impact**  
- Medium; secret providers sometimes need host paths (Homebrew), but `trustedDirs` concept suggests this can be modeled. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  

**Effort**  
- L.

**Validate**  
- Add tests that verify provider can still run when `trustedDirs` configured; ensure it fails closed otherwise.

---

### Phase 2 (target state): align with 1Password “ideal future” even with upstream design change

This phase addresses the core philosophical mismatch: **today’s bridge returns raw secrets into the OpenClaw runtime**, while 1Password’s ideal is **access without exposure** and “secrets remain secure even if systems are compromised.” ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  

#### 2.A Move from “secret delivery” to “credential broker / injection”
**Target design**  
- Replace “OpenClaw gets the API key” with “OpenClaw requests an operation; a deterministic broker performs authentication/injection.”  
- Examples (conceptual, not claiming OpenClaw supports this today):  
  - Model provider clients request “call OpenAI” without owning the API key; broker injects Authorization header at the network boundary.  
  - Browser tool requests “log into site X” and broker performs secure autofill without revealing password.

**Security benefit**  
- Directly implements 1Password’s “inject without handing over” and “raw credentials never enter LLM context.” ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  

**Compatibility impact**  
- High: requires OpenClaw architecture change (tool/model provider integration points) and possibly a new broker service boundary.

**Effort**  
- L+.

**Validation**  
- Threat-model review: demonstrate secrets never appear in OpenClaw process memory (only in broker).  
- Add automated checks that search OpenClaw logs, transcripts, and tool outputs for secret patterns.

#### 2.B Human-visible approvals for sensitive credential use (policy-driven)
**Target design**  
- Introduce deterministic approvals for secret use (not “in chat”), consistent with 1Password’s deterministic authorization prompt requirement. ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  
- For example: Control UI approval gate for “credential X used for tool Y” with time/uses bounds.

**Security benefit**  
- Aligns with 1Password’s “human users should explicitly authorize access to sensitive data” ideal. ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  

**Compatibility impact**  
- Medium-high; changes workflow ergonomics.

**Effort**  
- L.

**Validate**  
- Audit trails include approval context (who/what/when) and are immutable.

---

## 7) Actionable Engineering Backlog

### 7.1 GitHub Issues to open in the Resolver repo

1) **“Document and enforce strict default vault policy (deny ‘any vault’ unless explicitly configured)”**  
- **Description:** Ensure Resolver defaults align with least privilege by requiring explicit opt-in for broad vault access; update config init + README + snippet generator.  
- **Acceptance criteria:**  
  - `openclaw-1p-sdk-resolver init` produces config with strict policy.  
  - README includes a dedicated “Least privilege setup” section referencing service account vault scoping. ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  

2) **“Add golden tests for OpenClaw exec provider protocol output (fail-closed + omit unresolved IDs)”**  
- **Description:** Unit tests to ensure invalid JSON input, invalid IDs, or SDK failures never produce secret values and produce deterministic output that triggers OpenClaw failure behavior.  
- **Acceptance criteria:**  
  - Tests cover parse failures, config failures, policy failures, SDK errors/timeouts.  
  - Output always valid JSON with correct `protocolVersion` and no secret leakage in stderr. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  

3) **“Security regression test: ensure secret canary never appears in stderr output”**  
- **Description:** Add a test harness that runs resolver with a mocked SDK returning a canary secret, then fails intentionally and asserts canary not present in stderr or thrown errors.  
- **Acceptance criteria:**  
  - CI fails if canary appears in stderr.  
  - Documented in CONTRIBUTING / security notes. ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver))  

4) **“Add docs: ‘OpenClaw hardened runtime profile for secrets’ (sandbox all + minimal tools)”**  
- **Description:** Provide a recipe to align OpenClaw config with 1Password non-negotiables: sandbox all sessions, tool deny/allow, avoid elevated escape hatches.  
- **Acceptance criteria:**  
  - Example config includes `agents.defaults.sandbox.mode: "all"` and a minimal tool profile baseline. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated))  
  - Validation checklist includes `openclaw sandbox explain --json` usage. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated))  

5) **“Add operator checklist: 1Password service account setup + rotation + audit review cadence”**  
- **Description:** Include guidance to use a dedicated vault, read-only service account, and review service-account usage logs.  
- **Acceptance criteria:**  
  - Checklist references 1Password tutorial/blog guidance; no secrets included. ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  

6) **“Implement env-var scrubbing after read (best-effort)”** *(code change; needs source review)*  
- **Description:** After reading `OP_SERVICE_ACCOUNT_TOKEN`, delete it from `process.env` to reduce accidental propagation to child processes launched by resolver (if any).  
- **Acceptance criteria:**  
  - Unit test confirms env var removed post-init.  
  - README notes this is best-effort and does not remove from process memory.  

7) **“Add explicit warning banner: this is a ‘compromise pattern’ not 1Password’s recommended integration approach”**  
- **Description:** Reflect 1Password’s own “Security notice” prominently and explain what additional controls are required to mitigate risk (tool deny, sandbox, audit).  
- **Acceptance criteria:**  
  - README has a prominent callout with citations. ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  

### 7.2 Upstream OpenClaw Issues / PR proposals (minimal design sketch)

1) **OpenClaw: “Sensitive exec secrets providers: never log stdout/stderr; redact errors”**  
- **Rationale:** Exec provider response payload contains secrets. Any logging of stdout is catastrophic. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- **Sketch:** Add `secrets.providers.<name>.sensitive` and enforce no logging; safe debug prints only IDs and counts.

2) **OpenClaw: “Structured audit events for secret resolution (no values)”**  
- **Rationale:** Aligns with 1Password auditability principle while keeping secrets out of logs. ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  
- **Sketch:** Emit events for activation success/failure with provider name and count; reuse degraded/recovered codes. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  

3) **OpenClaw: “Option to run secrets exec providers in constrained sandbox/subprocess environment”**  
- **Rationale:** Reduce blast radius if resolver binary/deps compromised; align with “model manipulated” + “scope next” posture. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/security))  
- **Sketch:** Similar to tool sandboxing but dedicated for secrets activation; restrict mounts and env; require `trustedDirs` for binaries.

4) **OpenClaw docs: “Explicit statement about whether exec provider stdout/stderr is ever logged”**  
- **Rationale:** This is a critical unknown for secrets safety on disk. ([docs.openclaw.ai](https://docs.openclaw.ai/logging))  
- **Sketch:** Add a section in `gateway/secrets` and/or `logging` clarifying behavior and safe debugging patterns.

---

## 8) Open Questions / Unknowns

These are items I could not confirm from the accessed primary sources, and what would resolve them:

1) **Does OpenClaw ever log exec-provider stdout/stderr (especially secrets exec providers)?**  
- Why it matters: exec provider stdout contains raw secret values by design. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- Evidence needed: OpenClaw docs explicitly stating logging behavior, or source code review of exec provider runner and logger pipeline.

2) **How does OpenClaw treat “missing value” vs “empty string” for exec provider secrets?**  
- Why it matters: Resolver “fail closed” depends on OpenClaw interpreting unresolved secrets correctly at activation time. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets))  
- Evidence needed: source code for secrets activation validation and schema (or docs clarifying).

3) **Resolver code-level guarantees beyond README**  
- Known: README describes architecture modules (protocol.ts, sanitize.ts, onepassword.ts, etc.) but I could not access the file contents directly through GitHub’s blob views in this session. ([github.com](https://github.com/timshadel/openclaw-1p-sdk-resolver))  
- Evidence needed: direct access to repo files (`src/*`, config schema) to confirm:  
  - exact sanitization rules  
  - exact vault policy enforcement  
  - logging behavior in edge cases  
  - memory handling (e.g., token scrubbing)

4) **OpenClaw “Secrets Apply Plan Contract” content**  
- I reached the page `https://docs.openclaw.ai/gateway/secrets-plan-contract` but the tool did not return the body content in the captured view. ([docs.openclaw.ai](https://docs.openclaw.ai/gateway/secrets-plan-contract))  
- Evidence needed: page content access to confirm strict rejection rules (targets, path rules, and ref-only auth-profile behavior).

5) **Where secrets can surface into tool outputs / transcripts**  
- OpenClaw token/context docs show tool results count toward context windows; but I did not confirm whether any tool responses can include secrets accidentally (e.g., `/status`, debug tools). ([docs.openclaw.ai](https://docs.openclaw.ai/reference/token-use))  
- Evidence needed:  
  - documentation for each tool (especially exec/fs/browser/status/usage) on redaction behavior  
  - runtime experiment: run with canary secret and examine tool outputs and transcripts.

6) **1Password “short-lived tokens” applicability to service accounts**  
- 1Password recommends short-lived, scoped, revocable credentials when delivery is necessary, but the sources here do not define whether service account tokens are short-lived or how rotation should be automated. ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  
- Evidence needed: service account token lifecycle docs or API docs specifying TTL/rotation patterns.

---

## Closing synthesis: compatibility triangle narrative

- **What you can satisfy simultaneously (today):**  
  - Deterministic secret resolution (exec provider), not via MCP. ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  
  - Least privilege *if* the operator scopes the 1Password service account to a dedicated vault and Resolver enforces strict vault policy. ([developer.1password.com](https://developer.1password.com/docs/sdks/ai-agent/))  
  - “Raw secrets not in LLM context” *if* OpenClaw tool policy/sandboxing prevents the model from accessing secret-bearing surfaces and logging doesn’t leak. ([1password.com](https://1password.com/blog/security-principles-guiding-1passwords-approach-to-ai))  

- **What you can’t satisfy simultaneously (without Phase 2 changes):**  
  - 1Password’s “secrets remain secure even if systems are compromised” aspiration vs OpenClaw’s current “secrets in runtime snapshot memory” model. ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  
  - “Inject without handing over” vs Resolver/OpenClaw’s model of delivering the secret value into the runtime. ([1password.com](https://1password.com/blog/where-mcp-fits-and-where-it-doesnt))  

The roadmap above is designed so Phase 0 improves security materially *without breaking OpenClaw’s reality*, while Phase 2 lays out the architectural leap needed to converge on 1Password’s ideal.
