# Review report — settings/hooks reconcile (local gates vs §8 CI-preference) — 2026-07-12

> **Nature:** Evidence (append-only, §5) · **Date:** 2026-07-12 · **Reviewer:** main-session (Opus 4.8)
> **Method:** settings/hooks reconciliation — enumerate every local gate in `.claude/settings.json`
> (hooks + permission denies, **committed HEAD** = repo truth) × classify each (agent-runtime guardrail
> vs portable code-rule) × apply the enforcement ladder's **CI-preference** (constitution §8: "a machine
> gate that could live in CI or a local hook should live in CI") + the **§2 replacement test** ("a hook is
> a convenience mirror of a CI gate, never the only copy"). Cross-checked against
> `knowledge/registries/gate-inventory.yaml`. · **Result:** Reconciled — no promotion needed; 2 findings filed.
> **Evidence class:** E1 (settings.json read this session, committed + working diffed).

This is the E6-closing task (T6.2.3). It asks a single question of the **local** enforcement layer: **is
any rule trapped in a local hook/deny that, being a portable code-rule, ought to live in CI instead?**
(§8 CI-preference — CI survives a tool swap and a fresh clone; a local hook does not.) The dual question —
is any local gate the *sole* copy of a rule that also matters in CI (§2 replacement test) — is checked too.

## Scope — the local gates (committed `.claude/settings.json`)

**1 hook · 13 permission denies.** (The 406-entry `permissions.allow` list is a machine-local, per-session
convenience allowlist — not a governed enforcement gate — and is out of scope.)

### Hooks

| Hook | Rule it mirrors | Portable code-rule? | CI-preference verdict |
|---|---|---|---|
| PostToolUse `Edit\|Write` → `biome check --write` on the edited file | Biome lint/format (scoped, ADR-0023) | **Yes** — but its durable copy **already lives in CI** as `ci-biome` (ci.yml verify, changed-files scope) | **Satisfied.** The hook is a *convenience mirror*; the authoritative copy is in CI. Nothing to move. |

### Permission denies — classified

| Deny(s) | gate-inventory id | Nature | Belongs in CI? |
|---|---|---|---|
| `Bash(rm -rf:*)`, `Bash(sudo:*)` | deny-destructive | Agent-runtime safety (destructive/privileged shell) | **No** — a harness guardrail on the *agent's* actions; CI has no such action to gate |
| `Bash(git push:*)` | deny-push | Owner-gated action (push = a human decision) | **No** — "the agent must not push" is a harness rule, not a repo-code rule |
| `Bash(pnpm publish:*)`, `Bash(npm publish:*)` | deny-publish | Agent-runtime safety (no accidental publish) | **No** — harness guardrail |
| `Bash(curl:*)`, `Bash(wget:*)` | deny-net | Agent-runtime safety (no ad-hoc outbound fetch) | **No** — harness guardrail |
| `Read(**/*.pem)`, `Read(**/secrets/**)`, `Read(.env)`, `Read(.env.*)`, `Read(**/.env)`, `Read(**/.env.*)` | deny-secret-read | Agent-runtime safety (agent cannot *read* secrets) | **No** — complements `ci-gitleaks` (which stops secrets being *committed*); different concern, not a duplicate |

## Verdict — reconciled, no promotion (§8/§2 both satisfied)

- **No portable code-rule is trapped in a local gate.** The one gate with a code-rule nature (biome)
  already has its durable copy in CI (`ci-biome`); the hook is the sanctioned convenience mirror. Every
  other local gate is an **agent-runtime guardrail** — it governs what the *agent process* may do (delete,
  escalate, push, publish, fetch, read secrets), which has **no CI equivalent to migrate to**. CI gates a
  *diff*; these gate an *action*. They are correctly at rung 3 as harness-enforced guardrails.
- **§2 replacement test passes:** the only local gate that also matters in CI (biome) is *not* its sole
  copy — `ci-biome` is the durable copy. No rule would be lost on a tool swap.
- **Conclusion:** the settings/hooks layer conforms to §8 CI-preference as-is. **E6 needs no settings.json
  change.** This closes the E6 enforcement epic (T6.1.1 review + T6.2.1/T6.2.2 CI gates + this reconcile).

## Findings filed (NOT fixed here — §10 drift-is-a-defect, remediate as own task)

- **F1 — security, owner action (out-of-track file):** the **working-copy** `.claude/settings.json`
  (owner's uncommitted edit) has **dropped the 4 `.env` read-denies** that exist in committed HEAD —
  `Read(.env)`, `Read(.env.*)`, `Read(**/.env)`, `Read(**/.env.*)`. This *weakens the secret-read
  guardrail* in the owner's live harness (the agent could read `.env` files that the committed policy
  forbids). Not edited here — `.claude/settings.json` is the owner's out-of-track file, kept uncommitted.
  **Owner: restore the 4 denies or confirm the removal was intentional.**
- **F2 — L2 catalog drift:** `gate-inventory.yaml` `deny-secret-read` lists only `Read(**/*.pem)` +
  `Read(**/secrets/**)`, omitting the committed `.env` family (4 denies). The catalog under-lists L0.
  (Not caught by T6.2.1's `verified_on` re-verify, which confirmed denies/hooks/structure-test *presence*,
  not per-rule completeness.) Low severity; remediate by extending the `deny-secret-read` entry as its own task.
