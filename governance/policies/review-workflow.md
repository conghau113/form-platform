# Policy: Review Workflow

> **Artifact nature:** Normative (L1 — Policy)
> **Status:** Active · **Version:** 1.0 (semver-lite)
> **Authority:** Owner · **Ratified:** 2026-07-03 · **Verified-on:** 2026-07-03
> **Source (traceability):** constitution §5 (natures), §6 (lifecycle), §9 (impact
> manifest), §12 (supersession); `change-approval.md` (intake); `dor-dod.md` (gates);
> ADR-0007 (disposal door). On any conflict the constitution wins (precedence stack §4).

The full lifecycle of a change to a **governed artifact**, from a proposal through Active
and on to Deprecated / Superseded. Where `change-approval.md` is the **door in** (the DoR
intake that fixes decider, route, and evidence floor before work), this policy is the
**path through the house**: what a reviewer actually checks, how an artifact is versioned
and retired, and how a file is disposed of.

It owns two things the other policies only reference by name: the **per-nature review
checklists** and the **6-step disposal door** (ADR-0007).

## Scope

Governed L1/L2/L3 artifacts (constitution, policies, charters, procedures, decision
records, knowledge docs, registries, skills, agents, rules) and their removal. Product
code follows the product golden rules (`AGENTS.md`); a product change that also edits a
governed artifact routes that artifact here.

---

## 1. Lifecycle of a change

Eight stages. The first three are the intake in `change-approval.md` — named here for
continuity, not restated. This policy owns **review** onward.

| Stage | What happens | Owned by |
|---|---|---|
| **Propose** | An idea is filed (including mid-implementation ideas — never acted inline). | `change-approval.md` Step 1 |
| **Classify** | Nature × layer × architectural? (freeze gate if architectural, §11). | `change-approval.md` Steps 1–2 |
| **Route** | Nature → decider, evidence floor, review route. | `change-approval.md` Step 3 |
| **Review** | The nature checklist (§2) is run by the routed reviewer. | **this policy §2** |
| **Approve** | The decider returns an outcome; artifact moves along the lifecycle. | `change-approval.md` Step 5 · **§3** |
| **Version** | Lifecycle transition (§6); `FRAMEWORK_VERSION` bump on a shape change (§12). | **this policy §3** |
| **Deprecate** | A newer artifact supersedes it; it is kept, marked, still readable. | **this policy §4** |
| **Migrate / dispose** | Dependents are migrated (impact manifest §9); a removed file goes through the disposal door. | **this policy §4 · §5** |

## 2. Review checklists by nature

The routing matrix (`change-approval.md` Step 3) says **who** reviews and the **evidence
floor**; these checklists say **what** they check. A change spanning natures was already
split at intake (constitution §5), so exactly one checklist applies.

### Normative (L1) — owner always
- [ ] Every rule **traces to its source** (constitution / ADR / policy) named in the header.
- [ ] **Single nature** — no fact or runnable check embedded (else split per §5).
- [ ] Header correct: status · version · authority · verified-on.
- [ ] Any architectural change carries a passed freeze gate + an ADR (§11) — no new mechanism smuggled in.
- [ ] **Impact manifest discharged** (§9) before it may become Accepted.
- [ ] **Precedence-safe** (§4) — does not silently contradict a higher artifact.
- The owner's **deep-read is the real gate**; an isolated reviewer spawn is used **only for
  high-stakes** work (contract-touching or E5 bindings), never as review theater on prose.

### Descriptive (L2) — agent + reviewer
- [ ] Every claim **traces to L0** at its stated evidence class (E1/E2), read **this session** — never lifted from another doc.
- [ ] **Freshness contract present and current** (§10): scope · verified-on · method · cadence · class.
- [ ] `verified-on` stamped this session; the **method actually re-verifies** the claim (it runs).
- [ ] **Single nature** — no rule smuggled into a facts document.

### Executable — pass/fail is the review
- [ ] It **runs green now** (E1). The run *is* the review; a red check is a fail, full stop.
- [ ] Documents the **command + expected result**.
- [ ] A **new machine gate is advisory-first** — non-blocking for ≥1 phase before it may block (§8).
- [ ] **CI-preference** (§8): lives in CI, not only a local hook.

### Evidence (reports) — no ratification
- [ ] **Append-only** — never edits a past report; corrections are new appended entries.
- [ ] Records **date · method · result honestly**, including failures and skipped steps.
- [ ] Carries **no decision** — a report records what happened; it does not rule.

## 3. Approve & version

The decider returns one outcome (Accept / Accept-with-changes / Choose-option-X /
Reject-defer — vocabulary defined in `change-approval.md` Step 5). On acceptance:

- The artifact advances along the lifecycle `Draft → Proposed → Accepted → Active`
  (constitution §6). An **L3 binding may be regenerated only from an Active source.**
- **Version bump.** A content edit within the existing shape bumps the artifact's own
  semver-lite version in its header. A **shape change** — a new layer, nature, or evidence
  class — bumps **`FRAMEWORK_VERSION`** with a migration note (constitution §12.4), the same
  discipline as a `formVersion` bump.
- Acceptance of a normative change is only real once its **impact manifest is discharged**
  (§9); a conformance sweep then propagates it to dependents.

## 4. Deprecate, supersede, migrate

An artifact leaves Active by being replaced, never by being silently dropped.

- **Supersession over deletion** (constitution §12.2): the replaced artifact is marked
  **Superseded** (or **Deprecated** while a successor stabilizes) and **kept for
  traceability** — its header points to the successor. History stays auditable.
- **Migrate dependents.** The superseding change lists every dependent in its impact
  manifest (§9); each is updated or explicitly waived with a reason. An undischarged
  manifest blocks the supersession from being final.
- **Traceability preserved** (§12.3): every L3 binding still names its L1/L2 source after
  regeneration.

Deletion of a *file* (as opposed to superseding its content) is reserved for the disposal
door below — and even then the content is archived first, so nothing is truly lost.

## 5. The 6-step disposal door (ADR-0007, general policy)

The permanent home of the disposal workflow. It applies to **removing any file with
content** — tracked or untracked (a stale doc, an absorbed review file, a superseded
artifact whose content will not be kept in place). It exists because deleting an untracked
file is a **one-way door**: there is no git safety net, so recovery must be built *before*
the delete.

**Verify → Extract → Review → Commit → Archive → Delete.** In order; each step gates the next.

1. **Verify** — read the file in full; establish what it claims and whether any of it is still true.
2. **Extract** — port every still-open, still-true item into a governed home (roadmap / ADR / knowledge doc). Record the disposition of each item; "0 ported" is a valid, recorded result when everything is already absorbed or stale.
3. **Review** — the extraction and the disposal rationale are reviewed per the routing matrix (a disposal is a governed change).
4. **Commit** — commit the file into git **first** (a safety net) if it was untracked. This is the step that converts the one-way door into a revertible one — **Commit BEFORE Delete is non-negotiable.**
5. **Archive** — copy the file verbatim into `reports/archive/` and write a **disposal record** (`reports/archive/DISPOSAL-<date>-<slug>.md`): what it was, why disposed, the extraction/absorption ledger, and recoverability (git commit + archive path). Validate the archive is byte-identical to the original (**sha1**) before proceeding.
6. **Delete** — remove the original **only after** the archive is validated identical. git records a rename when the archived copy is byte-identical.

Because Commit precedes Archive/Delete, every step is revertible; the disposal is recorded,
not silent. **First live use:** E0 T0.3.2 disposed of `suggestions.txt` this way (safety-net
commit `1bb4d4e`, archive + record, delete after sha1 validation) — the reference example.

- **Program risk P8** (disposal skipped under pressure) is mitigated by this checklist: a
  disposal without a committed archive and a disposal record is **not done**, no matter the
  time pressure.
