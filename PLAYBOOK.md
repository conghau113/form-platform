# Playbook — building this with AI agents

Build contract-first. Go one vertical slice DEEP before going wide.
One phase = one branch = one PR = one changeset. No skipping ahead.

## Build sequence

| Phase | Package / area | Gate before moving on |
|------|----------------|-----------------------|
| 0 | Foundation: monorepo skeleton + agent-config overlay | first commit BEFORE any feature code |
| 1 | `form-schema` (contract) — keystone, do first | `pnpm --filter @org/form-schema test` green |
| 2 | `form-core` (JSONLogic, RBAC, registry) | typecheck green; depends only on schema |
| 3 | `form-renderer-web` (antd, responsive) | example JSON renders with ONE field type, then add types |
| 4 | `apps/builder` skeleton (Vite+antd) | preview pane renders; MVP edit = JSON textarea + viewport toggle |
| 5 | drag-drop canvas (dnd-kit) + property panel | a field can be dropped + configured |
| 6 | theme editor (ConfigProvider tokens, live preview, export) | theme JSON exports + applies live |
| 7 | `form-renderer-native` (RN) | same example renders on native; reuses schema+core |
| 8 | workflow-schema + workflow-core + @xyflow/react editor | a 3-state flow runs end-to-end |

## Per-task loop
1. Scope to ONE package / one slice. Bounded outcome.
2. Plan mode (shift+tab) for anything touching >1 file. Review the plan BEFORE code.
3. Implement autonomously (allowlist + format hook do the busywork).
4. Self-verify: `pnpm typecheck` + `pnpm test` until green (definition of done = AGENTS.md).
5. `reviewer` subagent on the diff (golden rules). Fix.
6. `pnpm changeset`; commit. One logical change per commit.
7. `/clear` for the next task.

## Prompt anatomy
- Goal: one concrete sentence.
- Scope: which package; what NOT to touch.
- Acceptance: which test/behavior proves it done.
- Do NOT restate conventions — AGENTS.md carries them (repeating = token waste + drift).

Good:  "In form-renderer-web, implement select.dataSource fetching via @tanstack/react-query
        (map labelKey/valueKey, refetch on dependsOn change). Add a test. Don't touch native."
Bad:   "make a dropdown from an API that works on mobile and looks nice."

## Subagents
- explorer (Haiku): 'where/how' questions before a change — isolates context.
- reviewer (Opus): after a change, before commit.
- Parallel: git worktrees, one agent per worktree.

## Context hygiene (token discipline)
- /clear between unrelated tasks; /compact + focus note when the bar fills.
- @-mention files, never paste large content.
- Tests are the agent's feedback loop — let it self-correct; don't re-read diffs by hand.
- Keep CLAUDE.md tiny (it imports AGENTS.md). Add nested per-package CLAUDE.md only where needed.
