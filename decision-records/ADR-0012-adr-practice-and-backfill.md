# ADR-0012: ADR practice — lifecycle, numbering, and retroactive backfill

- **Status:** Accepted (owner, 2026-07-03) — recommendation as written, via blueprint & roadmap approval
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register E3

## Context

Until this Decision phase, the repo had zero ADRs (verified). Yet it is decision-dense:
dozens of owner rulings live scattered in roadmap trackers ("owner chốt X"), commit
messages, session memory, and AGENTS.md rules whose *rationale* is nowhere on record.
Several of those decisions are load-bearing constraints that every future change must
respect (additive-schema/formVersion regime, JSONLogic-no-eval, peerDependency rule,
Prisma-not-TypeORM, vendor↔client no-hardcode-EVN principle, adaptive single-app shell,
shared-DB tenancy via the `projectId→tenantId` chokepoint, data-driven RBAC with the `*`
sentinel, `validateGraph`-as-hard-gate vs `lintGraph`-advisory split, skills-scoped biome).
The owner has now mandated the ADR template (11 sections) and location
(`decision-records/`) by instruction — those are settled; this ADR covers what remains.

## Problem

Three sub-decisions are open: (a) the ADR lifecycle and identity conventions going
forward; (b) whether historical decisions get backfilled as ADRs, and how many; (c) the
relationship between ADRs and the rules in AGENTS.md (which states constraints without
rationale). Unrecorded rationale is a specific AI-context hazard: a future session seeing
only the rule may "improve" it away precisely because the *why* is invisible.

## Constraints

- Template and location are owner-mandated (settled — recorded here as accepted context).
- Memory is machine-local (ADR-0004): rationale that lives only in memory does not
  survive the machine; the repo is the only durable home.
- Effort must stay proportional: archaeology has a real cost and mostly-dead payoff.

## Options

### Option A — Full historical backfill
Reconstruct ADRs for every recorded decision across all trackers and memory (~40+).

- **Pros:** complete decision history.
- **Cons:** weeks-equivalent effort; most decisions are settled implementation choices
  whose rationale is adequately captured in their tracker entries; the corpus becomes so
  large that load-bearing records drown in trivia — worse discoverability, not better.
- **Affected areas:** `decision-records/` (+40 files).
- **Maintenance cost:** every superseding change must now update an ADR — fine for 12
  living constraints, heavy for 40 historical footnotes.
- **Migration risk:** none, just sunk effort.

### Option B — Forward-only
ADRs start with this Decision phase; history stays where it is.

- **Pros:** zero backfill effort.
- **Cons:** the most dangerous gap stays open — the load-bearing constraints remain rules
  without recorded rationale, held together by machine-local memory and scattered tracker
  prose; the first post-memory-loss session is one plausible-sounding refactor away from
  violating a golden rule for reasons nobody wrote down.
- **Maintenance cost:** none now; risk-carrying.

### Option C — Selective backfill of living constraints
Backfill only decisions that are (test: ) *still constraining future work AND whose
rationale is not already durable in the repo*. Estimated 8–12 records (the list in
Context is the candidate set). Each backfilled ADR is short — status `Accepted
(retroactive)`, context/rationale/evidence pointing at the original tracker/commit — using
a compact variant of the template. Everything else stays forward-only.

- **Pros:** converts exactly the hazardous tribal knowledge into durable repo knowledge;
  bounded effort (roughly one phase); keeps `decision-records/` high-signal.
- **Cons:** the inclusion test involves judgment; some rationale reconstruction relies on
  memory/tracker archaeology and must be labeled as reconstructed.
- **Affected areas:** `decision-records/` (+~10 files); AGENTS.md rules gain "rationale:
  see ADR-XXXX" pointers (one line each, no rule text changes).
- **Maintenance cost:** proportional to living constraints only.
- **Migration risk:** low; mislabeled reconstruction is the main quality risk — mitigated
  by owner review of each retroactive record.

## Risks

- (B) interacts badly with ADR-0004's portability finding: memory is the current de-facto
  rationale store and it is machine-local. B leaves the framework structurally dependent
  on a store the framework itself may not rely on.
- (C) Reconstructed rationale can be subtly wrong (I infer *why* from *what*). Every
  retroactive ADR must carry a "reconstructed from evidence, ratified by owner" marker —
  the owner's review is the authority step, same as this phase.
- Lifecycle risk (all options): without a written status flow (Proposed → Accepted →
  Superseded-by-XXXX, never deleted), superseded ADRs become their own drift source.

## Recommendation

**Option C**, plus the standard lifecycle conventions (sequential numbering as used here;
statuses Proposed/Accepted/Rejected/Superseded with pointers; ADRs are immutable once
accepted — changes come as superseding records). Objectively stronger because the danger
that motivates backfill at all is concentrated in a small set of living constraints — C
buys ~all of A's protective value at ~quarter of its cost, while B leaves the single most
AI-specific hazard (rules whose rationale lives off-repo) unaddressed in a framework whose
mandate is exactly to eliminate context hazards.

## Confidence

High on C-vs-B (follows from the memory-locality fact). Medium on the candidate list —
finalizing it is itself owner-reviewable work within the backfill phase.

## Evidence

- Zero pre-existing ADRs: `find` for `*adr*`/`*decision*` empty (2026-07-03).
- Decision density: product-roadmap.md alone records 10+ "owner chốt" rulings with dates;
  AGENTS.md states 5 golden rules with no rationale text.
- Memory locality: `C:\Users\ASUS\.claude\projects\...` (outside repo).
- Near-miss precedent: workflow-editor session record notes `validateGraph` was almost
  extended (would have weakened the AI-repair-loop gate) — saved by a memory note, i.e.,
  by the non-durable store.

## Open Questions

1. Approve the candidate list in Context (owner may add/remove)?
2. Approve the compact template variant for retroactive records (full 11 sections would be
   padding for settled decisions)?
3. Should AGENTS.md rules carry one-line ADR pointers, or stay pointer-free with the
   linkage living only in the ADR index?
