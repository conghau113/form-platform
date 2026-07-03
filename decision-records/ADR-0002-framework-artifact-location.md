# ADR-0002: Location and versioning of framework artifacts

- **Status:** Accepted with modification (owner, 2026-07-03) — via blueprint approval, amended: root `governance/` (not `docs/governance/`), resolving OQ2
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register A4

## Context

The framework will produce several artifact classes: harness-executed assets (skills,
agent definitions, hooks, settings), governance documents (standards, constraints,
DoR/DoD, review workflow), decision records (this directory), and possibly generated
mirrors (Cursor rules per ADR-0001). The Claude Code harness fixes some locations:
skills live in `.claude/skills/`, agents in `.claude/agents/`, hooks/permissions in
`.claude/settings.json`, and `CLAUDE.md` auto-loads every session. Memory lives
*outside* the repo (machine-local under `~/.claude/projects/...`).

## Problem

Without a deliberate layout, framework knowledge scatters (some in `.claude/`, some in
`docs/`, some only in machine-local memory), which makes drift detection harder, makes a
fresh clone incomplete, and risks bloating the always-loaded `CLAUDE.md`. The layout also
determines what auto-enters context every session (cost) versus what is pulled on demand.

## Constraints

- Harness-mandated paths cannot move (`.claude/skills`, `.claude/agents`, settings).
- `CLAUDE.md` must stay tiny (loads every session; its header says so).
- Owner mandated `decision-records/` as the ADR output location (this phase).
- Engineering artifacts are English (owner mandate); Vietnamese product docs live in
  `docs/` today — the layout should not mix the two audiences confusingly.
- Context economy: governance must be pull-on-demand, not auto-loaded.

## Options

### Option A — Split by consumer (hybrid)
`.claude/` holds only harness-executed assets. A new `docs/governance/` holds standards,
constraints, DoR/DoD, review workflow. `decision-records/` at repo root holds ADRs
(as mandated). Skills reference governance docs by path (pull model).

- **Pros:** each file sits where its runtime expects it; governance is human-browsable
  beside existing docs; `CLAUDE.md` stays a pointer; everything travels with a clone.
- **Cons:** framework knowledge spans three roots — needs an index/map document.
- **Affected areas:** new `docs/governance/`; `CLAUDE.md` gains one pointer line;
  `decision-records/` (already created).
- **Maintenance cost:** low; the index is one more drift surface (small, invariant-style).
- **Migration risk:** minimal — purely additive.

### Option B — Everything under `.claude/`
Governance, standards, and ADRs all live inside `.claude/` next to skills.

- **Pros:** one root for all AI-related content.
- **Cons:** `.claude/` is tool-namespaced — governance is *engineering* content that should
  outlive any one tool (see ADR-0004 portability); mixes executable and normative docs;
  conflicts with the owner's explicit `decision-records/` instruction.
- **Maintenance cost:** low, but couples governance lifetime to Claude Code.
- **Migration risk:** ADRs would need to move from the mandated location.

### Option C — Everything under `docs/`
All framework content in `docs/framework/`; `.claude/` files become thin loaders pointing in.

- **Pros:** single documentation tree.
- **Cons:** fights the harness (skills must physically live in `.claude/skills` to be
  invocable — pointers add indirection without removing the files); still two roots in
  practice, now with extra hops.
- **Maintenance cost:** medium (indirection layer to keep честными).
- **Migration risk:** low but pointless churn.

## Risks

- Whatever the layout, memory must be treated as a *pointer cache*, never the only home of
  framework knowledge — otherwise a new machine or a memory wipe loses the framework
  (this is a governance rule to record regardless of option).
- Three-root sprawl (A) without an index recreates the discovery problem the framework
  solves; the index must be part of the same change.

## Recommendation

**Option A.** Objectively stronger because it is the only option that simultaneously
respects hard harness constraints (skills/agents cannot move), the owner's explicit
`decision-records/` mandate, and tool-independence of governance content (governance is
about the *repository*, not about Claude Code the tool — if the harness changes, the
standards survive untouched). Options B and C each violate at least one hard constraint
or add indirection with no offsetting benefit.

## Confidence

High. The constraints are mechanical; only the aesthetic split is judgment.

## Evidence

- Harness path requirements: `.claude/skills/**` and `.claude/agents/**` in active use
  (verified); skills invoked by name from these locations.
- `CLAUDE.md` header: "keep this file tiny — it loads every session".
- Memory is machine-local (`C:\Users\ASUS\.claude\projects\...`) — not clone-portable.
- Owner instruction this session: "Output: decision-records/".

## Open Questions

1. Confirm `decision-records/` stays at repo root permanently (recommended: yes; stable
   paths beat tidy paths once links exist).
2. Should governance docs be excluded from the product-docs tree entirely (e.g., a root
   `governance/` instead of `docs/governance/`) to keep `docs/` purely product-facing?
3. Does the per-phase commit workflow (commit → tracker → memory → stop) formally apply
   to framework phases too? (Assumed yes.)
