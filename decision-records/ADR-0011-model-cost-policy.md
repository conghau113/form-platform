# ADR-0011: Agent roster, model tiering, and token-cost doctrine

- **Status:** Accepted (owner, 2026-07-03) — recommendation as written, via blueprint approval; model-tier detail (Opus 4.8 default / Fable 5 escalation) seeded into the T2.4.1 registry
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register F5

## Context

The framework spans ~13 lifecycle stages, which naively suggests ~13 specialized agents.
But in the Claude Code cost model the two mechanism classes differ sharply: **skills** are
procedures loaded into the running context (cheap — tokens for the text once), while
**subagents** are freshly spawned contexts that re-derive repo understanding from zero
(expensive — the harness for this plan explicitly warns that spawning is the costly path).
Current precedent: exactly 2 agents, tiered by task nature — `explorer` on haiku (cheap
recall/search) and `reviewer` on opus (judgment). The owner's standing contract prioritizes
correctness and depth over speed, but token spend is money, and an unaffordable framework
is an unused framework.

## Problem

Without a codified doctrine, each lifecycle capability will be built with whatever
mechanism feels natural, trending toward agent-sprawl: N agent files whose prompts drift
apart (a new drift surface), N cold-starts per workflow, and a cost profile the owner
never chose. The framework's own governance must fix mechanism-selection and model
assignment before capabilities are designed.

## Constraints

- Harness guidance (this plan): do not spawn agents unless necessary; each spawn starts
  cold and re-derives context.
- Isolation is *required* for some functions: review objectivity genuinely benefits from a
  context that hasn't watched the implementation unfold (the existing `reviewer` embodies
  this); broad discovery benefits from spending tokens in a disposable context
  (`explorer`).
- Owner's accuracy-first contract: depth may not be sacrificed to save tokens on
  correctness-critical steps.
- Model tiers available: haiku (cheap/fast), sonnet (mid), opus/fable (deep reasoning).

## Options

### Option A — Rich specialist roster
One agent per lifecycle stage (ux-researcher, perf-reviewer, a11y-reviewer, doc-auditor,
release-manager…), each with a tuned prompt and model.

- **Pros:** conceptual clarity; each stage has a named owner; prompts can be deeply
  specialized.
- **Cons:** every agent file is a standing drift surface (shared conventions must be
  updated in N prompts); every invocation pays a cold-start; most stages don't need
  isolation — a perf review by a spawned agent has *less* context than the main session
  that just made the change; contradicts harness cost guidance.
- **Affected areas:** `.claude/agents/**` (+10 files), governance.
- **Maintenance cost:** highest, growing with roster size.
- **Migration risk:** consolidating later means retiring named agents referenced in docs.

### Option B — No policy (ad-hoc per task)
Decide mechanism and model each time.

- **Pros:** flexible.
- **Cons:** the ambiguity this Decision phase exists to eliminate; cost profile emerges
  rather than being chosen; inconsistent quality per stage.
- **Maintenance cost:** invisible until the bill or the inconsistency surfaces.

### Option C — Skills-first doctrine with a minimal fixed roster
Codified rule: **a lifecycle capability is a skill by default; an agent only where
isolation itself is the value.** Isolation-worthy today: (1) objective review (`reviewer`,
opus — kept), (2) disposable broad discovery (`explorer`, haiku — kept). New agents require
a documented isolation argument (an ADR-lite note). Model tiering codified: haiku =
mechanical search/recall; mid-tier = well-specified mechanical implementation if ever
delegated; opus-class = review, architecture, and anything judging correctness. Main
session (owner-selected model) executes the lifecycle using skills.

- **Pros:** matches the harness cost model and the 2-agent precedent that months of
  practice converged on; skills share the main context's already-paid understanding
  (deeper, not shallower, than a cold specialist); one convention change updates one
  skill, not N prompts; cost profile is a written policy the owner approved.
- **Cons:** skills lack isolation — a "UI review skill" run in the implementing context
  inherits its biases (mitigated: correctness-critical judgment routes to the isolated
  `reviewer`); very long lifecycles in one context pressure the context window (mitigated
  by per-phase /clear convention already in use).
- **Affected areas:** governance doc (mechanism-selection rule + tier table); existing two
  agent files gain framework metadata; no new agents by default.
- **Maintenance cost:** lowest.
- **Migration risk:** none — additive rule; escalation path to new agents stays open,
  gated by justification.

## Risks

- (C) The real danger is overloading `reviewer` as capabilities grow (golden rules today;
  + design review? + a11y? + perf?). Policy must state whether review dimensions extend
  the one reviewer's charter or justify siblings — flagged as an open question rather than
  silently decided here.
- (A)'s drift risk is not hypothetical: this repo's evidence shows duplicated normative
  text rots (per-app ARCHITECTURE.md); N agent prompts sharing conventions are exactly
  that shape.
- Budget reality is unverified: the owner's actual token-spend tolerance has never been
  stated. All options assume "reasonable"; a hard budget could force C regardless.

## Recommendation

**Option C.** Objectively stronger because it is the only option grounded in *both*
observed constraints: the harness's own cost warning and the repo's demonstrated
convergence on a 2-agent equilibrium after months of real work. It also minimizes the
framework's self-inflicted drift surface, which is the framework's own primary mandate.
A buys naming elegance with recurring cost and drift; B is the status quo ambiguity.

## Confidence

High on the doctrine; medium on the exact tier table (model landscape shifts; the table
should live in one governed doc so it's cheap to revise).

## Evidence

- Harness plan guidance: agent spawning is "the expensive path on this plan" (system
  instruction, this environment).
- Existing roster: `.claude/agents/{explorer,reviewer}.md` — haiku/opus split (read).
- Per-phase `/clear` convention (project CLAUDE.md) already manages context lifetime.
- Drift evidence for duplicated normative text: ADR-0013's stale-doc inventory.

## Open Questions

1. State a budget stance: is there a monthly token/cost ceiling the framework should
   treat as a constraint, or is cost secondary to correctness within reason?
2. When review dimensions grow (design/a11y/perf per the lifecycle), extend `reviewer`'s
   charter or add sibling reviewers (each needing an isolation argument)?
3. Confirm the main session's model choice stays owner-controlled (never set by the
   framework).
