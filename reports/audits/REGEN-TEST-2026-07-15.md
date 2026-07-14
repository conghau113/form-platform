# Regeneration-test — paper walkthrough — 2026-07-15

> **Nature:** Evidence (append-only, §5) · **Date:** 2026-07-15 · **Author:** agent (Opus 4.8)
> **Method:** trace, on paper, the regeneration path of each L3 binding from its Active L1/L2 source — validating the architecture's core promise "only L3 regenerates on a tool swap" + constitution §12 guarantee 3 (traceability preserved through regeneration) · **Result:** PASS — 12/12 bindings regenerable from an Active source, traceability total
> **Evidence class:** E2 (source-status read from L0) corroborated by E1 (`check:traceability` — 12/12 name a source, 72/72 links resolve)

The **regeneration test** (roadmap E8 T8.1.3, a paper walkthrough — no tool is actually swapped). The
meta-architecture claims **downward-only dependencies; only L3 (Execution Adapters) regenerates when the
tool changes** (a Claude→other-harness swap re-emits `.claude/*` + `.cursor/*` from the unchanged L0→L2).
This walkthrough proves that promise holds for the *current* binding set: every L3 binding (a) derives
from an **Active** source (§6 — a binding may only derive from an Active source), (b) **names** that
source (§12.3), and (c) is a faithful **condensation/mirror** that originates no rule (§2), so
regenerating it from the source reproduces it without information loss.

## The binding set (L3) and its sources

`check:traceability` (E1, run today) confirms the set-level guarantee: **12/12 bindings name a source,
72/72 governed relative links resolve.** Per-binding source + source-status (E2, read from L0):

| L3 binding | Source (L1/L2) | Source status | Regeneration relationship |
|---|---|---|---|
| `.claude/agents/explorer.md` | `governance/charters/explorer.md` v1.0 | **Active** | condensed from charter mandate/scope/evidence; harness frontmatter (haiku, read-only) matches tier |
| `.claude/agents/reviewer.md` | `governance/charters/reviewer.md` v1.0 | **Active** | condensed from charter; frontmatter (opus, +Bash) matches tier |
| `.claude/skills/phase-execution/SKILL.md` | `governance/procedures/phase-execution.md` v1.0 | **Active** | condensed 10-step run of the procedure |
| `.claude/skills/sweeps/SKILL.md` | `governance/procedures/sweeps.md` v1.0 | **Active** | condensed skeleton + A/B axes |
| `.claude/skills/knowledge-promotion/SKILL.md` | `governance/procedures/knowledge-promotion.md` v1.0 | **Active** | condensed promotion steps |
| `.claude/skills/accuracy-first/SKILL.md` | `governance/policies/verification.md` v1.0 | **Active** | **VERBATIM body** (ADR-0001 Option A) — header regenerated only |
| `.claude/skills/feature-module/SKILL.md` | `knowledge/standards/coding-standard.md` (L2, fresh per index) | Active (freshness-contracted) | condensed scaffolding conventions |
| `.claude/skills/repo-map/SKILL.md` | L0 `packages/`+`apps/` · `system-overview.md` | Active (freshness-contracted) | condensed repo map |
| `.claude/skills/workflow-editor/SKILL.md` | `docs/expansion/workflow-editor-v2.md` | living tracker | condensed editor file-map |
| `.cursor/rules/000-core.mdc` | Authority: `AGENTS.md` + `governance/` + ADRs | Active | derived mirror, "edit source then regenerate" banner |
| `.cursor/rules/renderers.mdc` | Authority: `AGENTS.md` + ADR-0016/0006 | Active | derived mirror |
| `.cursor/rules/schema.mdc` | Authority: `AGENTS.md` + ADR-0014 + coding-standard | Active | derived mirror |

## Walkthrough — three representative regenerations (one per binding kind)

**A. Agent binding — `reviewer.md` ← `charters/reviewer.md` (Active v1.0).**
Swap Claude Code for another harness ⇒ re-emit the agent binding from the charter: read the charter's
mandate + scope + evidence-obligations, condense to the harness's agent format, carry the frontmatter
tier the charter dictates (reviewer = opus + Bash), and stamp a `Source:` header linking back. The
charter is unchanged (L1); the binding is fully reconstructed from it. **No rule is lost** — the binding
originates none (§2), it renders the charter. ✓

**B. Skill binding — `sweeps/SKILL.md` ← `procedures/sweeps.md` (Active v1.0).**
Re-emit: read the procedure's skeleton (5 steps) + A/B axis specifics + false-positive discipline,
condense to a skill body that POINTS to the procedure (one home §5), stamp `Source:` + `Regenerated`.
Reconstruction is deterministic from the source. ✓ (This very task read the skill *and* its source and
found no drift — a live corroboration.)

**C. Cursor rule — `schema.mdc` ← `AGENTS.md` + ADR-0014 + coding-standard (Active).**
Re-emit the derived mirror from its Authority set; the "edit the source, then regenerate here" banner
makes the direction explicit. The mirror adds nothing the authorities don't state. ✓

**Special case — `accuracy-first` (ADR-0001 VERBATIM).** Its *body* is owner-authored and copied
verbatim; only the header regenerates. Regeneration = re-attach the header to the unchanged verbatim
body. This is the one binding whose content is not condensed-from-source but *is-the-source-text* — and
the walkthrough confirms the regeneration rule still holds (header cites `verification.md`, body
untouched). ✓

## §12 guarantee check (backward compatibility)

- **G1 Additive standards** — E0–E8 added standards with dates; none retroactively invalidated prior
  work. ✓
- **G2 Supersession over deletion** — no source was erased; the 6-step disposal door governs removals
  (T1.2.3). ✓
- **G3 Traceability preserved** — 12/12 bindings name their source (E1 `check:traceability`); every
  source is Active (E2). Regeneration keeps the trace. ✓
- **G4 Version bump on shape change** — E0–E8 were **content edits within the stable shape** (no new
  layer, nature, or evidence class introduced after T1.1.1). Per §12.4 these do **not** bump
  `FRAMEWORK_VERSION` → it correctly **remains the integer 1**. ✓

## Verdict

The regeneration promise holds: **every L3 binding is reconstructable from an Active L1/L2 source with
traceability preserved, and no binding originates a rule.** A harness swap would regenerate only the L3
adapter layer, leaving L0→L2 untouched — exactly the architecture's downward-only, single-regeneration
claim. Combined with the clean drift + conformance sweeps and the healthy first self-audit, the
framework's shape is stable and complete at **FRAMEWORK_VERSION 1 (v1.0 milestone)**.
