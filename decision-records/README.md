# Decision Records — Enterprise AI Development Framework

## Architecture freeze (owner ruling, 2026-07-03)

The framework blueprint is approved and the architecture is **frozen**. No new
architectural ideas are permitted post-freeze. Any new architectural proposal MUST,
before any implementation:

1. Identify the affected ADR(s) it would supersede or amend.
2. Explain why the existing architecture is insufficient (with evidence, not preference).
3. Estimate migration cost.
4. Estimate maintenance cost.
5. Receive explicit owner approval.

A proposal missing any of the five is not reviewable and must be rejected at intake.
This rule applies to AI agents and humans alike, including improvement suggestions
arising mid-implementation — they are filed as proposals, never acted on inline.
Permanent home: the framework constitution (roadmap task T1.1.1) and the
change-approval policy (T1.2.1). **The constitutional home now exists —
`governance/constitution.md` §11 (Active, 2026-07-03) hosts the binding text;**
this section remains as a pointer until the change-approval policy (T1.2.1) adds
the operational intake form.

Decision phase output (2026-07-03). One ADR per unresolved topic identified by the
assumption-register audit. **Statuses finalized 2026-07-03 (roadmap task T0.1.2).**
Blueprint & roadmap approval accepted eight ADRs (0001, 0002 with modification, 0004,
0006, 0007 with modification, 0011, 0012, 0013). The remaining five (0003, 0005, 0008,
0009, 0010) stay **Open** — each is a Definition-of-Ready gate for a specific downstream
task and must be decided before that item, but none blocks E0–E2. See each ADR header
for its gated task and the tracker `docs/expansion/ai-dev-framework.md` for the ledger.

Each ADR follows the mandated template: Context · Problem · Constraints · Options
(with per-option pros/cons, affected areas, maintenance cost, migration risk) ·
Risks · Recommendation · Confidence · Evidence · Open Questions.

The recommendation in each ADR is advisory. The decision belongs to the owner.

| # | Topic | Core question | Status |
|---|---|---|---|
| [ADR-0001](ADR-0001-existing-ai-assets-consolidation.md) | Existing AI assets | Absorb, run parallel, or rebuild the current skills/agents/rules? | Accepted |
| [ADR-0002](ADR-0002-framework-artifact-location.md) | Artifact location | Where do framework artifacts live and how are they versioned? | Accepted (mod: root `governance/`) |
| [ADR-0003](ADR-0003-working-language.md) | Working language | What language for conversation, given artifacts are English? | Open (gate → T3.3.1) |
| [ADR-0004](ADR-0004-framework-audience-portability.md) | Audience & portability | Solo-optimized or portable to future team members / machines? | Accepted |
| [ADR-0005](ADR-0005-release-readiness-scope.md) | Release readiness | How to govern a lifecycle stage that has never happened? | Open (gate → T3.5.1) |
| [ADR-0006](ADR-0006-deferred-surface-review-scope.md) | Deferred surfaces | Is `form-renderer-native` (and similar) in or out of review scope? | Accepted |
| [ADR-0007](ADR-0007-untracked-artifacts-disposition.md) | Untracked artifacts | Fate of `docs/architecture/system-overview.md` and `suggestions.txt`? | Accepted (with modification) |
| [ADR-0008](ADR-0008-ui-verification-strategy.md) | UI verification | Codify manual MCP smoke, build e2e, or hybrid? | Open (gate → E7) |
| [ADR-0009](ADR-0009-design-accessibility-ground-truth.md) | Design & a11y ground truth | Where do design/accessibility standards come from? | Open (gate → T3.4.x) |
| [ADR-0010](ADR-0010-external-reference-access.md) | External references | Access policy for EVN / web-admin / estd reference repos? | Open (gate → T3.4.2) |
| [ADR-0011](ADR-0011-model-cost-policy.md) | Model & cost policy | Agent roster size, model tiering, token budget doctrine? | Accepted |
| [ADR-0012](ADR-0012-adr-practice-and-backfill.md) | ADR practice | Numbering, lifecycle, and retroactive backfill of past decisions? | Accepted |
| [ADR-0013](ADR-0013-doc-drift-remediation-timing.md) | Drift remediation timing | Fix known-stale docs now, or after the drift detector exists? | Accepted |

## How to review

For each ADR: read Context → Options → Recommendation. Reply per ADR with one of:
- **Accept** (recommendation as written)
- **Accept with changes** (state the changes)
- **Choose option X instead**
- **Reject / defer** (state why)

Answers to the Open Questions sections can be given inline; unanswered open
questions block only their own ADR, not the others.

## Conventions — lifecycle · numbering · templates

These are the standing rules for authoring and maintaining decision records. They
instantiate constitution §6 (artifact lifecycle) and §3 (authority) for the ADR
artifact specifically, and codify the practice decided in
[ADR-0012](ADR-0012-adr-practice-and-backfill.md). Traceability: constitution §3, §6,
§11 · ADR-0012.

### Numbering & identity

- ADRs are numbered sequentially and zero-padded to four digits: `ADR-NNNN`. The number
  is permanent and never reused, even if the ADR is later Rejected or Superseded — a
  Rejected number is a real historical record, not a free slot.
- Filename: `ADR-NNNN-kebab-topic.md`. The first line is `# ADR-NNNN: <topic>`.
- The next free number is one above the highest in this directory (currently 0013 →
  next is 0014). Retroactive backfill records also take the next free numbers going
  forward; they are **not** renumbered into the past.

### Status lifecycle

An ADR is a point-in-time decision record, so it uses the decision-relevant subset of
the constitution §6 lifecycle (`Draft → Proposed → Accepted → Active → Deprecated →
Superseded`). Living normative documents (the constitution, policies) additionally pass
through **Active**; a decision record does not — once Accepted it *is* in force.

| Status | Meaning | Set by |
|---|---|---|
| **Draft** | Being written; not authoritative. | Author (AI or human) |
| **Proposed** | Complete, awaiting the owner. In this repo's index an undecided ADR that gates a downstream task is written **`Open (gate → Tx.y.z)`** — same state, task-linked. | Author |
| **Accepted** | Owner decided in favour; in force. Header records `Accepted (owner, <date>)`. Variants: `Accepted (with modification)`, `Accepted (retroactive)`. | **Owner only** (§3) |
| **Rejected** | Owner declined. Retained with its number; the rationale stays on record so the option is not silently re-proposed. | **Owner only** |
| **Deprecated** | Still readable, no longer the current guidance, no direct replacement. | Owner |
| **Superseded** | Replaced by a newer ADR. Header reads `Superseded by ADR-MMMM (<date>)`; the superseding record back-links `Supersedes ADR-NNNN`. | Owner |

### Immutability & supersession

- An **Accepted ADR is immutable.** You do not edit its decision to change your mind —
  you write a new ADR that supersedes it (constitution §6, §10 "supersession over
  deletion"). Typo/link fixes to a settled record are the only permitted in-place edits.
- ADRs are **never deleted.** Superseded and Rejected records are kept for history and
  traceability. Deletion of a governed artifact would itself require a decision record.
- Only the owner sets `Accepted` / `Rejected` / `Superseded` (constitution §3: L1
  normative and ADR acceptance are owner-only; the AI drafts and recommends, never
  self-ratifies).

### Templates

**Standard template** (new forward decisions) — the mandated 11 sections:

> Context · Problem · Constraints · Options (each with pros/cons, affected areas,
> maintenance cost, migration risk) · Risks · Recommendation · Confidence · Evidence ·
> Open Questions

Header block: `Status` · `Date` · `Deciders` · `Source`. See ADR-0001–0013 for the shape.

**Compact retroactive template** (backfilling a *living constraint* already in force —
per ADR-0012 Option C; used by roadmap tasks T1.3.2 / T1.3.3). A settled decision does
not need the full deliberation scaffold; the option analysis already happened in history.
Required sections only:

> **Header** — `Status: Accepted (retroactive)`, `Date` (of the *original* decision if
> known, else the backfill date, labelled), `Deciders`, `Source` (the tracker/commit/
> memory where the decision actually lives).
> **Context** — what the constraint is and where it operates.
> **Decision** — the rule, stated as it is enforced today.
> **Rationale** — *why*, reconstructed from evidence. This is the whole point of the
> backfill: the rule already exists in AGENTS.md / code; the missing durable asset is the
> reason.
> **Evidence** — concrete pointers (commit SHAs, tracker lines, file:line) that anchor
> the reconstruction to the repo, not to memory.
> **Reconstruction marker** — every retroactive ADR carries, verbatim near the top:
> *"Rationale reconstructed from repository evidence; ratified by owner."* The owner's
> ratification is the authority step (constitution §3), exactly as for a forward ADR.

Reconstructed rationale can be subtly wrong (inferring *why* from *what*); the marker plus
owner review is the mitigation (ADR-0012 Risks). If a `why` genuinely cannot be recovered
from evidence, say so explicitly rather than inventing a plausible one.
