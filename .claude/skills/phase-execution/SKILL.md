---
name: phase-execution
description: The ordered lifecycle for executing ONE governed phase of framework or product work in this repo — resume → plan → DoR gate → implement single-concern → self-verify by running → review → file findings → commit (1 task=1 commit) → record → stop. Use WHENEVER starting or resuming a tracked phase (a Tx.y.z task or a plan-doc phase) so the work stays single-concern, evidence-backed, and correctly committed + recorded. Binds governance/procedures/phase-execution.md.
---

# phase-execution — run one governed phase

> **Layer:** L3 — Execution Adapter (skill binding). Originates no rule (constitution §2); it is the
> operational rendering of a governed procedure — read the source for the *rule*, this for the *run*.
> **Source:** [`governance/procedures/phase-execution.md`](../../../governance/procedures/phase-execution.md)
> — the L1 normative procedure (ratified 2026-07-05, owner-delegated). One home §5: the full steps,
> rationale, and policy pointers live there; this condenses them.
> **Regenerated:** E5 T5.1.2 · 2026-07-05 — condensed from source, no drift.

**Unit of work:** **1 task = 1 commit = 1 review**, single-concern, independently revertible.
Sizing: **S** ≤ half a session · **M** = one phase · **L** must be split before work starts.

## The 10 steps → verify (each points to its governing policy)

1. **Resume context** — read `accuracy-first` + the track **tracker** (source of truth for phase
   status) + the **resume memory**. → *verify:* you can state the NEXT task id + its Cx size.
2. **Plan** — instantiate `knowledge/templates/phase-plan.md`; state a **verifiable goal** (a check,
   not "make it work") + steps→verify. → *verify:* the goal is falsifiable.
3. **DoR gate** — change-approval Steps 1–2: classify (nature × layer × **architectural?**); if
   architectural, clear the **freeze-gate 5 elements** (§11) or reject at intake. Confirm the
   **work-class evidence floor is met BEFORE writing** — extraction reads **L0**, not docs. →
   *verify:* nature declared; gating ADR (if any) Accepted; floor identified.
4. **Implement, single-concern** — change only what the task requires; do **not** refactor adjacent
   code (extraction ≠ refactoring, P4). Mid-impl architectural idea = **filed proposal, never inline**
   (§11). Keep out-of-track edits (`.claude/settings.json`, owner product fixes) **out** of the
   commit. → *verify:* every changed line traces to the task.
5. **Self-verify by running** — meet the claim's floor empirically, never by assertion. doc/extraction
   → run the artifact's method / re-verify vs L0; code → `pnpm typecheck` + `pnpm test` (+ live-smoke
   for behavior). **Behavior is always E1.** → *verify:* floor met by observed output; report
   faithfully — never round "tests fail" / "didn't run" up to "done".
6. **Review per the routing matrix** — review-workflow §2 checklist for the nature. **Isolated
   reviewer spawn only for high-stakes** (normative-L1 · contract · E5 bindings); routine = checklist
   in-session. For normative-L1 the **owner deep-read is the real gate** — recommend, never
   self-ratify (§3). → *verify:* checklist PASS (or findings filed).
7. **File findings, do not fix inline** — drift/defects noticed in passing are **recorded** (§10), not
   patched (P4); unrelated findings become their own task. → *verify:* each finding recorded, none
   silently fixed.
8. **Commit** — one concern; message states epic/task. A commit can't contain its own hash → the
   task's tracker row ships as **`_pending_`**, backfilled in the next task's commit (fixed-point). If
   a file is removed, run the **6-step disposal door** (Commit-BEFORE-Delete). → *verify:* `git log`
   shows one single-concern commit; own row `_pending_`.
9. **Record** — update the **tracker** (✅ + hash + gotchas) + **resume memory** + `MEMORY.md` index
   line, and **backfill the previous** task's `_pending_` hash. → *verify:* tracker + memory agree;
   prior row now carries its hash.
10. **Stop** — hand back for `/clear` + a fresh session (context cap, P3). → *verify:* no further work
    begins in the same context.

## Fixed-point patterns (load-bearing)
- **Own-row `_pending_` → next-commit backfill** (Step 8/9).
- **Findings-filed-not-fixed** (Step 7) — keeps the phase single-concern.
- **Out-of-track edits stay uncommitted** (Step 4) — `.claude/settings.json`, owner product fixes.

## Does NOT
Not the architectural-change path (that runs the freeze-gate → an ADR) · not a restatement of the
policies (it orders + points) · not sweeps / disposal / release (separate procedures / epics). For
those, see `sweeps` + `knowledge-promotion` skills and their procedures.
