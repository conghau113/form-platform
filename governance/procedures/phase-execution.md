# Procedure — phase execution

> **Artifact nature:** Normative (L1 — Governance Core / procedure)
> **Status:** Active · **Version:** 1.0 · **Authority:** Owner (ratified 2026-07-05, owner-delegated §3)
> **Source:** de-facto lifecycle lived across E0/E1/E2/E4 (~19 phases) · policies [change-approval](../policies/change-approval.md) · [dor-dod](../policies/dor-dod.md) · [review-workflow](../policies/review-workflow.md) · [verification](../policies/verification.md) · [accuracy-first](../../.claude/skills/accuracy-first/SKILL.md) (L3 binding)
> **Binding (L3):** a skill regenerates FROM this procedure (E5 T5.1.2) and must trace to it.

## Mandate

The ordered lifecycle for **one governed phase** of framework or product work: a single-concern
unit that ends in one commit and one hand-back. It **sequences** the policies — it does not
restate them. Each step points to the policy that governs it; read the policy for the *rule*, this
for the *order*.

**Unit of work (constitution / tracker global rules):** **1 task = 1 commit = 1 review**,
single-concern, independently revertible. Sizing: **S** ≤ half a session · **M** = one phase ·
**L** must be split before work starts.

## Admission evidence (why this procedure exists)

This is not a designed process; it is the **codification of the loop already lived**. Every phase
of E0, E1, E2, and E4 (≈19 phases) followed exactly these steps — that is the ≥2× recurrence the
E4 admission rule requires, and those phases *are* its dry-runs (constitution §14: codify lived
practice, never speculation).

## Steps → verify

1. **Resume context.** Read the working contract (`accuracy-first`) + the track **tracker** (source
   of truth for phase status) + the **resume memory**. → *verify:* you can state the NEXT task id
   and its Cx size from the tracker. *(verification policy: investigate before acting.)*

2. **Plan.** Instantiate [`knowledge/templates/phase-plan.md`](../../knowledge/templates/phase-plan.md):
   state the **verifiable goal** (a check, not "make it work") and the steps→verify. → *verify:* the
   goal is falsifiable. *(dor-dod; phase-plan template.)*

3. **DoR gate.** Run [change-approval](../policies/change-approval.md) Step 1–2: classify
   (nature × layer × **architectural?**); if architectural, clear the **freeze-gate 5 elements**
   (constitution §11) or reject at intake. Confirm the **work-class evidence floor is met BEFORE
   writing** — extraction reads **L0**, not docs. → *verify:* nature declared; gating ADR (if any)
   Accepted; floor identified. *(change-approval Steps 1–2; dor-dod work-class table.)*

4. **Implement, single-concern.** Change only what the task requires; do **not** refactor adjacent
   code (extraction ≠ refactoring — program risk P4). A mid-implementation architectural idea is
   **filed as a proposal, never acted inline** (freeze rule §11). Keep out-of-track uncommitted
   edits (e.g. `.claude/settings.json`, owner-authored product fixes) **out** of the framework
   commit. → *verify:* every changed line traces to the task.

5. **Self-verify by running.** Meet the claim's evidence floor empirically, never by assertion
   (verification policy). By work-class: **doc/extraction** → run the artifact's method / re-verify
   against L0 (for an index method, calibrate it); **code** → `pnpm typecheck` + `pnpm test`
   (+ live-smoke for behavior); **behavior is always E1**. → *verify:* the floor is met by observed
   output; report faithfully — never round "tests fail" / "didn't run" up to "done". *(verification
   policy; dor-dod.)*

6. **Review per the routing matrix.** Apply the [review-workflow](../policies/review-workflow.md)
   §2 checklist for the artifact's nature. **Isolated reviewer spawn only for high-stakes**
   (normative-L1 · contract-touching · E5 bindings); routine review = checklist in the main session
   (reviewer charter; conserves quota). For normative-L1, the **owner deep-read is the real gate** —
   the agent recommends, never self-ratifies (§3). → *verify:* checklist PASS (or findings filed).
   *(review-workflow §2; change-approval Step 3.)*

7. **File findings, do not fix inline.** Drift or defects noticed in passing are **recorded**
   (constitution §10) — not patched (P4). Own-task remediation is reserved for the artifact under
   work; unrelated findings become their own future task. → *verify:* each finding recorded in the
   tracker/index, none silently fixed.

8. **Commit.** One concern, independently revertible, message states the epic/task. The commit
   **cannot contain its own hash**, so the task's tracker row ships as **`_pending_`** and is
   **backfilled in the next task's commit** (the fixed-point pattern). If the task removes a file,
   it follows the **6-step disposal door** (review-workflow §5: Commit-BEFORE-Delete). → *verify:*
   `git log` shows one single-concern commit; own row `_pending_`. *(review-workflow; change-approval
   Step 6.)*

9. **Record.** Update the **tracker** (✅ + commit hash + gotchas) + the **resume memory** + the
   `MEMORY.md` index line, and backfill the **previous** task's `_pending_` hash. → *verify:* tracker
   status and memory agree; prior row now carries its hash. *(change-approval Step 6;
   per-phase-commit-then-memory.)*

10. **Stop.** Hand back to the owner for `/clear` + a fresh session (context-cap — program risk P3).
    → *verify:* no further work begins in the same context.

## Fixed-point patterns (emergent, load-bearing)

- **Own-row `_pending_` → next-commit backfill** (Step 8/9): a commit can't record its own hash;
  the tracker row is completed one commit later. Observed every phase E0→E4.
- **Findings-filed-not-fixed** (Step 7): the discipline that keeps a phase single-concern and stops
  extraction sliding into refactoring (P4).
- **Out-of-track edits stay uncommitted** (Step 4): `.claude/settings.json` and owner product fixes
  are deliberately kept out of framework commits.

## Scope — does NOT

- **Not** an architectural-change path — that runs the freeze-gate (change-approval Step 2 /
  constitution §11) and produces an ADR; this procedure assumes the architecture is fixed.
- **Not** a restatement of the policies — it orders them and points; the rules live in their one
  home (§5, §14).
- **Not** for sweeps, disposal, or release — those are separate procedures (drift/conformance sweep
  T4.2.2, knowledge-promotion T4.2.3) or epics (E7/E8). This covers one build phase only.
