# Policy: Definition of Ready / Definition of Done

> **Artifact nature:** Normative (L1 — Policy)
> **Status:** Active · **Version:** 1.0 (semver-lite)
> **Authority:** Owner · **Ratified:** 2026-07-03 · **Verified-on:** 2026-07-03
> **Source (traceability):** constitution §5 (natures), §6 (lifecycle), §7 (evidence
> classes), §9 (impact manifest); `change-approval.md` (routing); tracker "Global rules".
> This policy is the permanent home of the Global DoR/DoD the tracker states operationally.

Two quality gates: **DoR** answers *may work start?*; **DoD** answers *is it actually done?*
The distinguishing rule of this policy: the **evidence floor is typed by work-class.** A bug
fix and a governance document are "ready" and "done" by different proofs — applying one
standard to the other is either theater or negligence.

Evidence class names (E1–E5) are defined once in constitution §7 and only referenced here.

---

## Global DoR — every task, before work starts

1. **Gating ADR Accepted** — if the task names one (see the tracker's Open-ADR gates).
2. **Nature declared** (constitution §5) → the review route is fixed via `change-approval.md`.
3. **Work-class evidence floor met** (table below) **before writing.** Extraction reads **L0
   code, not docs.** A claim that cannot meet its floor is not ready — upgrade the evidence
   (run it, read the source) first.
4. **Upstream merged; branch correct.**

## Global DoD — every task, before "done"

1. **Header matches nature** — normative: status + version · descriptive: freshness contract
   · executable: command + expected result · evidence: date + method + result.
2. **Registered in `knowledge/index.yaml`** if governed (in force from E2 onward).
3. **Review passed** per the routing matrix (`change-approval.md` Step 3) + decider
   ratification.
4. **Commit + tracker + resume-memory updated;** repo checks (`typecheck`/`test`/biome) left
   green — untouched, not newly broken.

---

## Work-class evidence table

| Work class | DoR floor (before starting) | DoD proof (before "done") |
|---|---|---|
| **Bug fix** | **E1** — a failing repro (test or smoke) that reproduces the bug exists | the repro now passes; full suite shows no regression |
| **Feature** | **E2** — the contract it consumes read this session (`form-schema` / `form-core`) | `typecheck` + `test` green; **changeset** if a package changed; **E1 live-smoke** for user-facing behavior |
| **Refactor** | **E1** — the relevant suite is green *before* | the same suite green *after* (behavior identical); no contract/`formVersion` change |
| **Doc / extraction** (L2 descriptive) | **E2** — the L0 source read this session | every claim traces to L0 at its stated class; `verified-on` stamped; freshness contract present |
| **Governance** (L1 normative) | traceability to the constitution/ADR/policy source | fidelity self-check (no mixed nature, header correct) + owner ratification; **impact manifest discharged** (constitution §9) |
| **Verification** (evidence / report) | **E1** — the check is actually run | honest result recorded; append-only, never edited after |

---

## Notes

- **Named floors (tracker T1.2.2):** *bug = E1 repro*, *feature = E2 contract reads* — the two
  the framework calls out explicitly; the table generalizes the pattern to every work-class.
- **Behavior always needs E1.** Any DoD row asserting runtime behavior (feature live-smoke,
  bug repro, refactor equivalence) is discharged by an observed run, never by assertion.
- **`accuracy-first` is the behavioral binding of this policy** — "verify by running, not
  asserting." When that skill is regenerated as a traceable L3 binding (epic E5), it cites
  this rule as its source.
- A work-class not in the table inherits the Global DoR/DoD and declares its floor at intake
  (`change-approval.md` Step 1).
