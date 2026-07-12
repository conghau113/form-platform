# ADR-0008: UI verification strategy (manual MCP smoke vs automated e2e)

- **Status:** Accepted (owner-delegated, 2026-07-12) — Option C as recommended (thin critical-path Playwright + codified manual-MCP smoke, growth rule "broken twice", advisory-first per §8); the DoR gate for E7 is now cleared
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register D6

## Context

Verified state: the repo has **no e2e framework** — no Playwright/Cypress config, no
Storybook, no visual regression. UI verification happens as a *manual* live-smoke via MCP
browser tools at the end of every phase, plus unit/component tests (Vitest, ~380 builder
tests). This manual smoke is expensive (owner + agent time, every phase), non-repeatable
(evidence lives in session transcripts and memory notes, not executable form), and
non-cumulative (a phase smokes its own feature; earlier features are re-verified only by
accident). Known debt confirms the gap: one pre-existing broken characterization test
(theme-write) and one flaky containers test have persisted across sessions.

## Problem

The framework must codify a verification strategy with evidence requirements. "What we do
today" provides depth per phase but no regression floor between phases; enterprise-grade
release readiness (ADR-0005) eventually needs a repeatable, executable UI verification
path. The question is where on the automation spectrum this repo should sit, given a
solo team and a UI built on antd (whose DOM is churn-prone for selectors).

## Constraints

- Accuracy-first contract: done = demonstrated behavior, not asserted behavior — some form
  of live verification is non-negotiable.
- CI runs on ubuntu-latest with Docker available (Testcontainers already used), so a
  full-stack boot in CI is feasible.
- Solo team: flake-maintenance budget is small; a flaky suite that gets ignored is worse
  than no suite.
- MCP browser tooling is session-interactive — it cannot run in CI.

## Options

### Option A — Codify the manual MCP smoke only
Turn current practice into a governed procedure: per-phase smoke checklist template,
evidence capture format (what was clicked, what was observed, console state), stored with
the phase record. No automated e2e.

- **Pros:** zero new infrastructure; formalizes what already works; keeps the human-judgment
  depth (visual/UX assessment automation can't do).
- **Cons:** still no regression floor — feature N can silently break feature N-3; evidence
  remains prose, not executable; every re-verification costs full manual effort forever.
- **Affected areas:** governance verification doc; skill for smoke procedure.
- **Maintenance cost:** low fixed, high variable (manual effort scales with feature count).
- **Migration risk:** none.

### Option B — Full e2e suite in CI
Adopt Playwright; broad coverage of builder flows; runs on every push.

- **Pros:** strongest regression net; executable evidence.
- **Cons:** large build-out for a solo team; antd DOM + drag-drop (dnd-kit) + canvas
  (xyflow) are the *hardest* surfaces to automate reliably — broad coverage guarantees a
  flake budget the team cannot pay; CI time grows (full-stack boot + browser).
- **Affected areas:** new e2e package/app, CI workflow, docker-in-CI wiring.
- **Maintenance cost:** highest; flaky-test triage becomes a standing tax.
- **Migration risk:** sunk cost if abandoned (the likely outcome at this team size).

### Option C — Thin critical-path e2e + codified manual smoke (hybrid)
A deliberately small Playwright suite (order of 5–8 specs) covering only stable,
high-value flows: login/auth round-trip, create project/form, save/load form, publish
version, submit + view submission, workflow run happy-path. Runs in CI against the
docker-compose stack. Everything exploratory/per-phase stays manual-MCP, codified as in
Option A. Growth rule: a spec is added only when a flow has broken twice (evidence-driven,
not aspiration-driven).

- **Pros:** regression floor exactly where breakage hurts most (auth/persistence/publish
  paths change rarely → low flake risk); manual smoke keeps covering the churn-prone
  editor surfaces where automation is weakest; bounded maintenance by design (growth rule).
- **Cons:** two verification mechanisms to govern; initial setup cost (~a phase of work);
  CI duration increase (~3–5 min).
- **Affected areas:** new e2e location, `ci.yml` job, governance verification doc,
  smoke-procedure skill.
- **Maintenance cost:** low-bounded (the growth rule is the cap).
- **Migration risk:** small; the suite is additive and severable.

## Risks

- (A) The existing broken/flaky unit tests show that without an executable floor,
  regressions already slip and persist — this risk is observed, not hypothetical.
- (C) Scope creep is the killer: without the growth rule enforced in governance, C decays
  into B. The rule must be written into the verification standard.
- Environment policy (all options): CI must own its stack lifecycle (compose up/down);
  locally, the framework should *probe* ports 3001/5173 and instruct, never assume —
  existing gotchas (EADDRINUSE, stale server on 3001 causing false smoke failures) are
  recorded incidents.

## Recommendation

**Option C.** Objectively stronger because it allocates automation to where its
reliability is highest and its value largest (stable persistence/auth flows that manual
smoke re-verifies only by accident), and keeps humans+MCP where automation demonstrably
struggles (drag-drop canvas, visual UX). A leaves an observed failure mode unaddressed;
B commits an unpayable maintenance budget. C's bounded-growth rule makes its long-term
cost a policy choice rather than an emergent burden.

## Confidence

Medium-high. The cost model for B is well-evidenced (antd/dnd-kit/xyflow automation
difficulty is industry-known; flaky containers test already exists); the exact critical-path
list is a design detail for later.

## Evidence

- No e2e/Storybook/Playwright config in repo (find/glob verified 2026-07-03).
- Pre-existing broken characterization test + flaky containers test (memory, multiple
  session records; to be re-confirmed by a fresh `pnpm test` at implementation time).
- Smoke false-failure incident: stale server on port 3001 caused a 404 false-fail (FB1
  session record) — evidence that manual environments need probing policy.
- CI already runs Docker (Testcontainers note in `ci.yml`).

## Decision (2026-07-12)

**Option C accepted** by the owner (delegated approval of the recommendation, precedent
ADR-0003/0005). A deliberately thin Playwright critical-path suite runs in CI against the
docker-compose stack; the churn-prone editor surfaces (drag-drop canvas, visual UX) stay on
manual-MCP smoke, codified as a procedure. The suite's long-term cost is capped by a governance
rule, not left to emerge. This opens the DoR for epic **E7** (T7.1.1–T7.3.1), which is fully
severable (constitution §12) and does not couple to E0–E6/E8.

**Open questions resolved:**

1. **Critical-path flow list — APPROVED as proposed** (owner, 2026-07-12): login/auth
   round-trip · create project/form · save/load form · publish version · submit + view
   submission · workflow run happy-path. These are the stable, low-churn flows where automation's
   reliability is highest and manual smoke re-verifies only by accident.
2. **Timing — now**, as its own epic E7 (owner directive to continue E7). Governance core (E0–E6)
   has landed; E7 is severable and additive.
3. **Blocking posture — advisory-first**, resolved by governance not re-decided here: constitution
   §8 makes advisory-first **mandatory** for any new machine gate (non-blocking ≥1 phase before it
   may block; a *blocking* gate is disabled only via a decision record). T7.3.1 codifies the
   promotion — the suite blocks merge only after N clean runs + the "broken twice" growth rule are
   written into the verification standard.

**Growth rule (the anti-scope-creep guard, must be governed — see Risks C):** a spec is added to
the suite only when a flow has **broken twice** (evidence-driven), and this rule lands in
`knowledge/standards/verification-standard.md` at T7.3.1 so C cannot decay into B.
