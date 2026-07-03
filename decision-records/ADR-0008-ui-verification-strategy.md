# ADR-0008: UI verification strategy (manual MCP smoke vs automated e2e)

- **Status:** Open (as of 2026-07-03) — DoR gate for E7 (Playwright critical-path, severable); decide before E7, does not block E0–E6/E8
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

## Open Questions

1. Approve the proposed critical-path flow list (login, project/form CRUD, save/load,
   publish, submit/view, workflow run)?
2. Timing: e2e setup as an early framework phase, or after governance core lands?
3. Should e2e failures block merge (CI-required) from day one, or run advisory first
   until flake-free for N runs?
