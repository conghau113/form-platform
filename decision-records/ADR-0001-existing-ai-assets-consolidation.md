# ADR-0001: Consolidation of existing AI assets

- **Status:** Accepted (owner, 2026-07-03) — recommendation as written, via blueprint & roadmap approval
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register A3

## Context

The repo already carries a working, battle-tested AI toolchain: 4 skills
(`accuracy-first`, `repo-map`, `feature-module`, `workflow-editor`), 2 subagents
(`explorer`/haiku, `reviewer`/opus), a two-file instruction chain
(`CLAUDE.md` → `AGENTS.md`), a machine-local memory system, and 3 Cursor rule files
(`.cursor/rules/*.mdc`) duplicating the golden rules. The new framework will cover the
full lifecycle, of which these assets already cover parts (coding conventions, review,
repo navigation, working contract).

## Problem

If the framework is built as a new layer beside these assets, the repo has two rule
systems whose divergence is guaranteed over time — the exact "documentation drift
poisons AI context" failure the framework exists to eliminate. If the assets are
discarded and regenerated, owner-authored content (`accuracy-first` is the owner's
working contract) and accumulated track knowledge (`workflow-editor`) are lost or
must be reproduced with regression risk.

## Constraints

- The framework must be generated from repo practice (owner mandate) — the existing
  assets ARE that practice, codified.
- Cursor remains an editor/autocomplete tool only (owner mandate); its rules still feed
  autocomplete context but must never become a second architectural rulebook.
- Skill/agent names are referenced from memory files and docs; renames break resume flows.
- `CLAUDE.md` loads every session and must stay tiny (its own header says so).

## Options

### Option A — Absorb and extend (single system)
Existing skills/agents become framework components, kept in place and versioned by the
framework's governance. New lifecycle capabilities extend the same inventory. `.cursor/rules`
is reduced to a derived, invariant-only artifact regenerated from the framework's canonical
standards (with a "generated — do not edit" banner), or deleted if the owner prefers.

- **Pros:** one source of truth; preserves proven content; smallest diff; migration is mostly
  metadata (ownership/versioning), not rewrites.
- **Cons:** framework inherits any existing weaknesses of the assets (e.g., `reviewer` checks
  only golden rules, not the full future review workflow) and must refactor them in place.
- **Affected areas:** `.claude/skills/**`, `.claude/agents/**`, `CLAUDE.md`, `AGENTS.md`,
  `.cursor/rules/**`.
- **Maintenance cost:** lowest — one inventory to keep current.
- **Migration risk:** low; keep existing names stable to avoid breaking memory references.

### Option B — Parallel layers
Leave existing assets untouched; the framework adds its own skills/standards alongside.

- **Pros:** zero migration risk; nothing proven is disturbed.
- **Cons:** two rule systems by construction; every future convention change must be applied
  twice; agents must decide which system wins on conflict — undecidable without governance,
  which then IS consolidation done badly.
- **Affected areas:** additive only.
- **Maintenance cost:** highest over time (double bookkeeping, guaranteed divergence).
- **Migration risk:** none now; a forced, larger consolidation later.

### Option C — Clean rebuild
Deprecate all existing assets; regenerate everything from the framework.

- **Pros:** uniform structure and voice from day one.
- **Cons:** discards owner-authored contract text and track knowledge; regenerated content
  must be re-validated against months of practice; high effort for negative expected value.
- **Affected areas:** everything Option A touches, plus full rewrites.
- **Maintenance cost:** same as A after the rebuild.
- **Migration risk:** highest — regression in agent behavior during the swap; memory files
  reference retired names.

## Risks

- (A) Refactoring `accuracy-first` in place could subtly weaken the owner's contract —
  mitigate by treating its normative content as owner-approval-required on any edit.
- (B) is the only option that structurally contradicts the framework's anti-drift mandate.
- Cursor-rules sub-risk: if kept hand-maintained, they will drift; if deleted, Cursor
  autocomplete loses golden-rule context (small but nonzero value).

## Recommendation

**Option A**, with `.cursor/rules` kept as a small, invariant-only derived artifact
(regenerated only when golden rules change). Objectively stronger because: (1) it is the
only option satisfying both the anti-drift mandate and the derive-from-repo mandate;
(2) evidence shows invariant-style docs in this repo do not rot (AGENTS.md, cursor rules
were found accurate) while duplicated state docs do — so consolidation targets the real
failure mode at minimal cost; (3) it preserves the highest-value asset class (owner-authored
working contract) untouched.

## Confidence

High on A-vs-B (structural argument). Medium on the Cursor sub-decision (depends on how
much the owner actually uses Cursor autocomplete).

## Evidence

- Asset inventory verified 2026-07-03 (files read this session).
- Drift pattern: `apps/api/ARCHITECTURE.md` stale (SQLite/x-owner-id claims) while
  AGENTS.md/cursor rules accurate — invariant docs hold, duplicated state docs rot.
- `accuracy-first` skill records the owner's explicit working contract.
- Memory files reference skills by name (`feature-module`, `workflow-editor`).

## Open Questions

1. Cursor rules: derived artifact, frozen as-is, or deleted?
2. May the framework rename/reorganize skills, or must existing names stay stable?
3. Is editing `accuracy-first` allowed at all, or is it owner-only text the framework wraps?
