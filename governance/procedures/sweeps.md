# Procedures — drift-sweep & conformance-sweep

> **Artifact nature:** Normative (L1 — Governance Core / procedures)
> **Status:** Active · **Version:** 1.0 · **Authority:** Owner (recommended 2026-07-04, ratification pending §3)
> **Source:** drift = per-artifact method calibration (T2.1.1–T2.5.1) + batch [calibration report](../../reports/calibration/CALIBRATION-2026-07-04.md) `acd9204`; conformance = assumption-register golden-rule verification (2026-07-03) + this-phase dry-run + the standing `structure.test.ts` gate · policies [verification](../policies/verification.md) · [review-workflow](../policies/review-workflow.md) · constitution §8/§10/§13
> **Binding (L3):** a skill regenerates FROM these procedures (E5 T5.1.2) and must trace to them.

## Mandate

Two **periodic, batch, repo-wide verifications** that produce append-only **Evidence** (§5). They
share one skeleton and differ only in the axis they check:

- **Drift-sweep** — a registered **L2 descriptive** artifact vs **L0**: *is the doc still true?*
  (freshness contract, §10). Runs the `knowledge/index.yaml` methods.
- **Conformance-sweep** — **L0** vs a **normative rule** (a golden rule, standard, or charter):
  *does the code still obey the rule?* Repo-wide and retroactive — it complements the
  per-diff [reviewer](../charters/reviewer.md), which only guards changes *at the door*; a sweep
  catches violations that already got in, or that a *newly added* rule now forbids.

Both are **Observe**-loop instruments (constitution §13) and roll up into the periodic **audit**
(E8, [audit-report](../../knowledge/templates/audit-report.md)).

## Shared skeleton → verify

1. **Fix the scope & the method.** Name exactly what is checked and the **executable** method
   (a `grep`/`ls`/test command, or the artifact's `index.yaml` method). A method with no runnable
   check is not admissible (E1 requires execution — verification policy). → *verify:* the method
   runs and returns output.
2. **Run every item as a batch.** One pass over the whole set — the detector calibrating itself.
   → *verify:* every item has a recorded result, none skipped.
3. **Classify each result** (see below): pass · **false-positive (method too broad)** · **real
   finding**. → *verify:* every non-pass is one of the two.
4. **Fix the method in place; file the finding as its own task.** A detector bug is corrected in the
   same sweep (it is not L0 drift); a real drift/violation is **recorded, never patched inline**
   (§10, program risk P4) and becomes a separate remediation task. → *verify:* no L0 fix rides
   along in the sweep commit.
5. **Write the append-only report.** Never edit a past report — supersede with a new dated one
   (§5). → *verify:* filed under `reports/…`, dated, with the method output as evidence.

## False-positive vs. real finding (the core discipline)

Every real sweep so far has produced a **too-broad-pattern false-positive** — treat this as the
default suspicion before declaring a finding:

- Drift-sweep (E2 validation): the builder fetch-confinement method excluded only `apiFetch.ts` and
  false-flagged the sanctioned `auth/client.ts`. → **method fixed**, doc was correct.
- Conformance-sweep (this phase's dry-run): `new Function` matched `new FunctionGuard(…)`; a bare
  `prisma\.` matched the sanctioned `health.controller.ts` + `scripts/`; `eval(` matched
  *"never eval()"* comment prose. All method-too-broad, **zero real violations**.

**Rule:** a mis-fire on known-good L0 is a **detector bug** (narrow the method — word boundaries,
exclude sanctioned files, skip comments), *not* a defect in L0. Only a mis-match that survives a
tightened method is a **real finding**, filed per §10.

## A. Drift-sweep — specifics

- **Set:** every entry in `knowledge/index.yaml` (descriptive-only, per the owner ruling).
- **Method:** the entry's own `method` field, run against its `scope` globs.
- **Reports:** the batch → [calibration-report](../../knowledge/templates/calibration-report.md)
  (`reports/calibration/`); a single confirmed drift → [drift-report](../../knowledge/templates/drift-report.md)
  (`reports/drift/`).
- **`verified-on`:** a batch that only validates *method correctness* does **not** bump
  `verified-on`; a full re-verification of a doc's prose does (§10).
- **Cadence:** each artifact's `cadence` in the index + the roadmap E2 validation / E8 audit.

## B. Conformance-sweep — specifics

- **Set:** the enforceable rules — golden rules (AGENTS.md / ADRs), extracted standards (E3), and
  the `structure.test.ts` structural gate ([gate-inventory](../../knowledge/registries/gate-inventory.yaml)).
- **Method:** the rule's own check — e.g. `\beval\(|new Function\(` absent from runtime src
  (ADR-0015); `fetch(` only in `apiFetch.ts` + `auth/client.ts` (builder rule); feature-folder
  structure (`structure.test.ts`). Authoring the *precise* per-rule methods (e.g. Prisma-confinement)
  belongs to the **standard** that owns the rule (T3.1.1), not here — this procedure is *how to run
  a sweep*, not the rule catalog.
- **Reports:** a confirmed violation is filed like a drift finding (per-item evidence) and rolls up
  into the §13 **audit** (E8); no dedicated template is created until a real sweep must file one
  (§14, no speculation).
- **Standing instance:** `structure.test.ts` runs the feature-folder conformance on every CI test
  run — a continuous conformance-sweep already at ladder rung 3.

## Admission evidence

- **Drift-sweep** — ≥2×: each `index.yaml` method was calibrated at creation (T2.1.1–T2.5.1) **and**
  batch-run in the E2-validation calibration report. The batch run is its Active dry-run.
- **Conformance-sweep** — ≥2×: the assumption-register golden-rule verification (2026-07-03: eval /
  fetch / structure) **and** this phase's dry-run (eval / fetch / Prisma / structure), plus the
  standing `structure.test.ts` gate. The dry-run above is its Active dry-run.

## Scope — does NOT

- **Not** a per-change review — that is the reviewer charter (per-diff, at the door); a sweep is
  batch, repo-wide, retroactive.
- **Not** the rule catalog — conformance-sweep runs the methods a standard/charter/ADR defines; it
  does not author them (E3 standards do).
- **Not** a remediation — a sweep *detects and files*; fixing L0 drift/violations is a separate
  task (§10, P4). It fixes only its own detector bugs.
