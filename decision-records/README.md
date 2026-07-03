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
