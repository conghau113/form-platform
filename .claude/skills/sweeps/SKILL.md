---
name: sweeps
description: How to run a drift-sweep (a registered L2 doc vs L0 — "is the doc still true?") or a conformance-sweep (L0 vs a normative rule — "does the code still obey?"). Both are batch, repo-wide verifications producing append-only Evidence. Use WHENEVER running a periodic freshness/audit check or verifying whether docs or golden rules still hold across the whole repo. Core discipline: a mis-fire on known-good L0 is a detector bug (narrow the method), NOT a finding. Binds governance/procedures/sweeps.md.
---

# sweeps — drift-sweep & conformance-sweep

> **Layer:** L3 — Execution Adapter (skill binding). Originates no rule (constitution §2); it is the
> operational rendering of a governed procedure — read the source for the *rule*, this for the *run*.
> **Source:** [`governance/procedures/sweeps.md`](../../../governance/procedures/sweeps.md) — the L1
> normative procedure (ratified 2026-07-05, owner-delegated). One home §5: the full skeleton,
> admission evidence, and A/B specifics live there; this condenses them.
> **Regenerated:** E5 T5.1.2 · 2026-07-05 — condensed from source, no drift.

Two **periodic, batch, repo-wide** verifications that produce append-only **Evidence** (§5), sharing
one skeleton and differing only by axis:
- **Drift-sweep** — a registered **L2 descriptive** artifact vs **L0**: *is the doc still true?* Runs
  the `knowledge/index.yaml` methods.
- **Conformance-sweep** — **L0** vs a **normative rule** (golden rule / standard / charter): *does the
  code still obey?* Repo-wide + retroactive; complements the per-diff reviewer (which only guards *at
  the door*) by catching violations already in, or ones a newly-added rule now forbids.

## Shared skeleton → verify
1. **Fix scope & method** — name exactly what is checked + the **executable** method (`grep`/`ls`/test
   or the entry's `index.yaml` method). No runnable check = not admissible (E1). → *verify:* it runs.
2. **Run every item as a batch** — one pass, the detector calibrating itself. → *verify:* every item
   has a result, none skipped.
3. **Classify each result** — pass · **false-positive (method too broad)** · **real finding**.
4. **Fix the method in place; file the finding as its own task** — a detector bug is corrected in the
   same sweep (it is not L0 drift); a real drift/violation is **recorded, never patched inline** (§10,
   P4) → a separate remediation task. → *verify:* no L0 fix rides along in the sweep commit.
5. **Write the append-only report** — never edit a past report, supersede with a new dated one (§5).
   → *verify:* filed under `reports/…`, dated, with the method output as evidence.

## False-positive vs. real finding (the core discipline)
Every real sweep so far produced a **too-broad-pattern false-positive** — treat that as the default
suspicion before declaring a finding. Seen: `new Function` matching `new FunctionGuard(…)`; bare
`prisma\.` matching sanctioned `health.controller.ts` + `scripts/`; `eval(` matching a *"never
eval()"* comment; `fetch(` confinement excluding only `apiFetch.ts` and flagging the sanctioned
`auth/client.ts`. **Rule:** a mis-fire on known-good L0 is a **detector bug** (narrow the method —
word boundaries, exclude sanctioned files, skip comments), *not* an L0 defect. Only a mis-match that
survives a tightened method is a **real finding**, filed per §10.

## A. Drift-sweep
Set = every `knowledge/index.yaml` entry (descriptive-only). Method = the entry's own `method` over
its `scope`. Batch → `calibration-report` (`reports/calibration/`); a single confirmed drift →
`drift-report` (`reports/drift/`). A method-only batch does **not** bump `verified-on`; a full prose
re-verification does. Cadence = each entry's `cadence` + E2-validation / E8 audit.

## B. Conformance-sweep
Set = enforceable rules (golden rules in AGENTS.md/ADRs, E3 standards, the `structure.test.ts` gate).
Method = the rule's own check (e.g. `\beval\(|new Function\(` absent from runtime src per ADR-0015;
`fetch(` only in `apiFetch.ts` + `auth/client.ts`; feature-folder structure). **Authoring the precise
per-rule method belongs to the standard that owns the rule (T3.1.1), not here** — this is *how to run
a sweep*, not the rule catalog. A confirmed violation is filed like a drift finding and rolls into the
§13 audit (E8). Standing instance: `structure.test.ts` runs feature-folder conformance every CI test.

## Does NOT
Not a per-change review (that is the reviewer charter, per-diff at the door) · not the rule catalog
(it runs methods a standard/charter/ADR defines) · not remediation (it detects + files; fixing L0
drift is a separate task — it only fixes its own detector bugs).
