# Policy: Change Approval

> **Artifact nature:** Normative (L1 — Policy)
> **Status:** Active · **Version:** 1.0 (semver-lite)
> **Authority:** Owner · **Ratified:** 2026-07-03 · **Verified-on:** 2026-07-03
> **Source (traceability):** constitution §3 (authority), §5 (natures), §9 (impact
> manifest), §11 (freeze-amendment rule). This policy is the operational intake form of
> those sections; on any conflict, the constitution wins (precedence stack §4).

The single intake path for a proposed change to a **framework artifact**. It runs at the
Definition-of-Ready boundary — **before** work starts — to fix the decider, the review
route, and the evidence floor. Getting this wrong is cheap to fix here and expensive to fix
after the work exists.

## Scope

Applies to changes to governed L1/L2/L3 artifacts (constitution, policies, charters,
procedures, decision records, knowledge docs, registries, skills, agents, rules).

**Out of scope:** product code changes, which follow the product golden rules (`AGENTS.md`).
Exception: a product change that *also* edits a governed artifact (e.g., a doc it must keep
true) routes that artifact through this policy.

---

## Step 1 — Classify

Answer three questions about the proposed change:

1. **Nature** (constitution §5): normative · descriptive · executable · evidence. A change
   that spans natures must be split into separate artifacts first.
2. **Layer** (constitution §2): L1 · L2 · L3.
3. **Architectural?** Does it touch a frozen decision — add/alter a layer, a nature, an
   evidence class, or the shape of an Accepted ADR? Yes / No.

## Step 2 — Freeze intake gate *(only if Step 1.3 = Yes)*

The five-element gate from constitution §11. This is a **hard gate**: if any element is
missing, the proposal is **not reviewable — reject at intake and do not start work.**

- [ ] 1. Affected ADR(s) named (what it supersedes or amends).
- [ ] 2. Existing architecture proven insufficient — with **evidence, not preference**.
- [ ] 3. Migration cost estimated.
- [ ] 4. Maintenance cost estimated.
- [ ] 5. Explicit **owner** approval obtained.

An improvement idea that surfaces **mid-implementation** is filed as a proposal through this
same gate — never acted on inline. Passing the gate produces (or updates) an ADR; only then
does the change proceed to Step 3.

## Step 3 — Route

Route by nature. The decider is authoritative (constitution §3); the reviewer/evidence floor
is the minimum, not a ceiling.

| Nature | Decider | Evidence floor | Review route |
|---|---|---|---|
| **Normative** (L1) | **Owner only** | n/a — rules, not facts | Owner deep-read + agent self-checklist (fidelity to source, no mixed nature, header correct). **Isolated reviewer spawn only for high-stakes:** contract-touching or E5 bindings. Routine → checklist in the main session (conserves quota). |
| **Descriptive** (L2) | Agent + reviewer; owner spot-checks | **E1 or E2** vs. L0 | Reviewer checklist: every claim traces to L0 at the stated evidence class; freshness contract present and current (constitution §10). |
| **Executable** | Pass/fail of the check itself | **E1** (it runs) | Run it. Green = pass; the run *is* the review. |
| **Evidence** (reports) | None — append-only | **E1** | Not ratified and never edited after the fact; only appended to. |

Rationale for the normative row's "isolated only high-stakes" is the pure-Claude reviewer
ruling: spawning a product-golden-rules reviewer against a governance markdown yields no
signal — the owner's deep-read is the real gate.

## Step 4 — Impact manifest *(normative changes)*

Per constitution §9, a normative change is **Accepted only when its impact manifest is
discharged**: list every dependent artifact (bindings, docs, registries, other policies);
each is updated or explicitly waived with a reason. An undischarged manifest **blocks
acceptance**. After acceptance, run a conformance sweep to propagate and record residue.

## Step 5 — Decide

The decider replies with one outcome (same vocabulary as ADR review):

- **Accept** — as written.
- **Accept with changes** — state the changes; author applies before Active.
- **Choose option X** — where alternatives were presented.
- **Reject / defer** — state why; the proposal is recorded, not silently dropped.

Acceptance moves the artifact along the lifecycle (constitution §6) toward Active. An L3
binding may be regenerated **only from an Active source**.

## Step 6 — Record

Commit (1 task = 1 commit), update the tracker and resume memory (per-phase convention).
A superseded artifact is marked Superseded and kept, never erased (constitution §12); file
disposal follows the 6-step door in the review-workflow policy (T1.2.3).
