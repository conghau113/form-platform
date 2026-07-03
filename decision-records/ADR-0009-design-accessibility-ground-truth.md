# ADR-0009: Ground truth for design-system governance, UX research, and accessibility

- **Status:** Open (as of 2026-07-03) — DoR gate for T3.4.x (design/a11y standards); decide before E3, does not block E0–E2
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register D7, F6

## Context

The framework must cover UX research, UI review, design-system governance, and
accessibility review. Verified reality: the repo's entire explicit design system is
`form-theme`'s token set (one primary color, radius, spacing, fontSize + antd algorithm);
there is no design-system document, no Figma/design assets, no accessibility target, no
a11y tests, no perf budget, and no benchmark corpus. Implicit design practice exists —
consistent antd usage, Vietnamese locale, responsive 24-col grid, recent deliberate UX
phases (P1a/P1b, workflow-editor UX rounds with owner-reviewed screenshots) — but it has
never been written down as standards.

## Problem

Standards for these lifecycle stages cannot be *extracted* from repo documents the way
coding standards can, because the documents don't exist. The framework needs a legitimate
source of design/a11y authority, or these stages become either empty or invented-from-
generic-templates — the latter explicitly banned by the owner.

## Constraints

- Owner mandate: derive from the repository, not generic templates — but the repo is
  silent here, so "derivation" must mean extracting *implicit* practice from the UI itself
  plus ratification of proposed gaps.
- antd 5 is the component substrate (locked-in); its accessibility ceiling and design
  language bound what standards can demand.
- Product context: enterprise Vietnamese-market clients (EVN-like) + self-serve P2 users;
  benchmark expectations come from that market.
- No design professional on the team; the owner is the taste authority.

## Options

### Option A — Owner supplies ground truth
Owner provides design references: a design language spec, benchmark product list,
accessibility target, mockups where relevant. Framework encodes them.

- **Pros:** authority is unambiguous; framework work is pure encoding.
- **Cons:** the assets almost certainly don't exist to be supplied (none found anywhere in
  the ecosystem); blocks four lifecycle stages on artifact-production by a solo owner whose
  comparative advantage is elsewhere; realistic outcome is indefinite blockage.
- **Affected areas:** none until supplied.
- **Maintenance cost:** owner-side, ongoing.
- **Migration risk:** none.

### Option B — Extract implicit practice + ratified proposals (two-mode)
Framework *extracts* what current UI practice already implies (antd-native patterns,
existing spacing/layout conventions, the vi-locale decisions, responsive breakpoints from
P1b) into a descriptive baseline, then *proposes* the missing normative pieces — an
accessibility target (WCAG 2.1 AA as the proposed default for enterprise), design-review
heuristics, benchmark list — each requiring explicit owner ratification before becoming
governance. Extraction-derived content and owner-ratified proposals are labeled
distinctly (the "evidence ledger" discipline the roadmap already uses).

- **Pros:** unblocks all four stages; honors derive-from-repo where possible and makes the
  unavoidable proposals visible and vetoable; owner effort = review, not authoring;
  the extracted baseline documents real practice, so it starts drift-free.
- **Cons:** extracted baselines can enshrine existing UX debt as "standard" (the current UI
  has known rough edges — that's why UI/UX P1 phases exist); proposals carry my judgment
  until ratified.
- **Affected areas:** new governance docs (design standards, a11y target, review
  checklists); no product code.
- **Maintenance cost:** medium — design standards are state-docs and need verification
  cadence like all others.
- **Migration risk:** low; standards are advisory until wired into review workflow.

### Option C — Defer these stages
Ship the framework without design/UX/a11y governance; revisit later.

- **Pros:** zero speculation.
- **Cons:** directly contradicts the owner's mandated lifecycle scope; the product is in an
  active UI/UX improvement track (P1a/P1b just shipped, P1c pending) — this is when design
  governance pays most, not least.
- **Migration risk:** none, but the mandate is unmet.

## Risks

- (B) Debt-enshrinement: mitigate by pairing extraction with a benchmark comparison pass,
  so the baseline records "current practice" and "gap vs benchmark" as separate fields —
  never presenting current practice as aspiration.
- Accessibility: antd 5 has known a11y limitations (contrast defaults, focus management in
  complex widgets); a ratified WCAG target must be scoped to "achievable on antd" or it
  becomes an un-actionable standard (instant drift).
- Benchmark selection is itself taste-laden; the list must be owner-ratified
  (candidates: EVN `web-admin` for client expectations — access per ADR-0010; plus 2–3
  public enterprise form/workflow products for market bar).

## Recommendation

**Option B.** Objectively stronger because it is the only option that both unblocks the
mandated stages and stays within the derive-from-repo principle honestly: extraction where
practice exists, labeled proposals where it doesn't, ratification as the authority
mechanism. A blocks on assets that don't exist; C ignores the mandate. B's main risk
(enshrining debt) has a concrete, cheap mitigation already proven in this repo's own
evidence-ledger practice.

## Confidence

High on the mode split (it follows from verified absence of ground truth). Medium on the
specific proposed defaults (WCAG 2.1 AA, benchmark candidates) — those are exactly what
ratification is for.

## Evidence

- `form-theme/src/tokens.ts` read in full: 4-field token set is the entire explicit design
  system (2026-07-03).
- No design assets/Storybook/a11y config found (find/glob verified).
- Active implicit practice: P1a (ConfigProvider locale vi, antd App context), P1b
  (responsive editor <1366px) — deliberate, owner-reviewed UX decisions in git history.
- Roadmap §7 evidence-ledger discipline (read-vs-inferred labeling) already established.

## Open Questions

1. Ratify WCAG 2.1 AA (scoped to antd-achievable) as the accessibility target, or choose
   another level?
2. Benchmark corpus: which products define the bar? (Proposed: EVN web-admin + 2–3 public
   enterprise builders — owner to name preferences.)
3. Is there any existing design reference I'm unaware of (mockups, a client style guide,
   screenshots of an admired product)?
