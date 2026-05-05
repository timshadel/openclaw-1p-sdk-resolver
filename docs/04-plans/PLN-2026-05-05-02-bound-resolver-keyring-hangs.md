---
created: 2026-05-05
---

# Bound Resolver Keyring Hangs

## Intent

Fix resolver mode so local CLI invocations always emit protocol JSON when token loading or 1Password resolution blocks. The immediate failure is a hung no-stdout resolver process when run by `codefactory`, which causes OpenClaw's exec-provider gateway to time out.

## Scope

- Apply `OP_RESOLVER_TIMEOUT_MS` to the whole resolver request after stdin is parsed, including runtime token loading.
- Ensure system keyring operations observe cancellation even if the underlying keychain implementation blocks.
- Add focused tests for timeout behavior around runtime token loading.
- Use the `git-workflow` skill as often as prudent to create cohesive commits during implementation and finish with committed work and a clean working directory.

## Validation

- Run `go test ./...`.
- If practical, run a local resolver command with a short timeout and confirm stdout contains an empty protocol response instead of hanging.
