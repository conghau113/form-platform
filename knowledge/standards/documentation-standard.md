# Documentation Standard

> **Artifact nature:** Descriptive (L2 — Knowledge). This standard *describes* how documents are
> written and maintained in this repository: how to pick an artifact's nature, how a descriptive
> doc carries its freshness contract, and which language it uses. It does **not** originate rules
> (constitution §2). The normative sources are **pointed to, not restated**: the four natures and
> lifecycle live in the constitution (§5, §6); the freshness contract in §10; the working-language
> decision in **ADR-0003** (Accepted, Option A). Extracted from those sources + the doc tree.
>
> **Freshness contract** (constitution §10; method authoritative in the index, not here):
> **class** E1 · **verified-on** 2026-07-04 · **cadence** re-verify when the constitution's nature/
> freshness sections or ADR-0003 change; else each release · **scope** `governance/constitution.md`,
> `decision-records/ADR-0003-working-language.md`, `knowledge/index.yaml`. Registered as
> `standard-documentation` in [`knowledge/index.yaml`](../index.yaml). Drift = finding (§10).

---

## 1. How to read this standard

Every governed document answers three questions before it is written: **what nature is it?**
(fixes the header + review route), **if descriptive, how does it stay fresh?**, and **what
language is it in?** This standard is the extracted, practical answer to each; the binding rules
live in the constitution + ADR-0003, which this doc cites and does not re-decide.

## 2. Pick the nature (and where it lives)

Every file has **exactly one** of four natures — never mixed (constitution §5). The nature fixes
the header and the review route, and in this repo it also predicts the location.

| Nature | It contains | Header carries | Lives in | Review |
|---|---|---|---|---|
| **Normative** | Rules, constraints, decisions (MUST/MUST NOT) | status + version | `governance/` (constitution, policies, charters, procedures) + `decision-records/` (root, L1) | Owner |
| **Descriptive** | Facts about L0 ("14 modules"), extracted standards, runbooks, registries | freshness contract (§3) | `knowledge/` + colocated `apps/*/ARCHITECTURE.md` + `docs/architecture`, `docs/usage.md` | Agent + reviewer |
| **Executable** | Runnable checks / methods | the command + expected result | the index `method:` blocks; `*.test.ts` gates | pass/fail = the review |
| **Evidence** | Reports of what happened (audits, drift, calibration, disposal) | date + method + result | `reports/` (append-only) | none — never edited |

- **A doc that would state a rule *and* assert a fact *and* embed a check must be split** into
  three registered artifacts (§5). The common case: a standard that wants to mandate a rule points
  **up** to the ADR/constitution that owns the rule and **down** to the gate that checks it, rather
  than restating either (as the coding/verification standards do).
- **Progress trackers** (`docs/expansion/*.md`) are **evidence-nature** and are deliberately not
  index-registered — their freshness is the per-phase update discipline, not a contract (see the
  index `unregistered_by_design` block).

## 3. Freshness for descriptive docs

Every descriptive (L2) doc carries a **freshness contract** so stale knowledge cannot silently
poison AI context (§10). The pattern this repo uses:

- A **header block** at the top declaring the §10 fields — **nature · class (§7) · verified-on ·
  cadence · scope** — and **pointing to its index entry by id**. See any of `runbook/dev-stack.md`,
  `standards/coding-standard.md`, `standards/verification-standard.md` for the shape.
- The **executable re-verify `method` lives in [`knowledge/index.yaml`](../index.yaml) only**, not
  in the doc — so there is one authoritative copy of the check and no two-places drift. The header
  names the fields; the index owns the command.
- **`verified-on`** is the date the method last ran green against L0; **cadence** states the
  periodic + per-change re-verify triggers.
- **Drift = defect, never a silent fix (§10, §5).** A doc found stale is filed as a finding (and,
  where applicable, a drift/calibration report under `reports/`) and remediated as its own task —
  extraction that notices adjacent drift **files** it, never patches inline.

## 4. Language (ADR-0003, Option A)

- **Engineering artifacts** — agents, skills, prompts, standards, governance, ADRs, code comments
  — are written in **English**.
- **Product / business documentation** may stay **Vietnamese**.
- **Conversation** — status updates, completion summaries, `AskUserQuestion` prompts, plan reviews
  — is in **Vietnamese** (the standing memory conventions).

This is the working-language decision ratified in ADR-0003 (Accepted 2026-07-04, Option A). A
switch to English-everywhere would be a superseding ADR, not an edit here.

## 5. Extracted vs proposed

Everything above is **extracted** from the constitution (§5/§6/§10), ADR-0003, and the observed
doc tree. **Zero proposed items** this pass. A new documentation rule not yet practiced would be
filed as a proposal for owner ratification (freeze rule §11), never asserted here as binding.

## 6. Related

Constitution [§5 natures](../../governance/constitution.md) · §6 lifecycle · §10 freshness;
[ADR-0003](../../decision-records/ADR-0003-working-language.md);
the freshness-contract mechanism in [`knowledge/index.yaml`](../index.yaml).
