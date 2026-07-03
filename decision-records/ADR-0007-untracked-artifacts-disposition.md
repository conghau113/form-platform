# ADR-0007: Disposition of untracked artifacts (system-overview.md, suggestions.txt)

- **Status:** Accepted with modification (owner, 2026-07-03) — Option A, amended:
  **no document may be deleted immediately after extraction.** The mandatory disposal
  workflow is: **Verify → Extract → Review → Commit → Archive → Delete**, where Delete
  is permitted only after the archived content has been validated. This amendment is a
  general policy for all future extract-and-remove operations, not only these two files
  (permanent home: change-approval / review-workflow policy, roadmap T1.2.x).
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register D4, D5

## Context

Two untracked files sit in the working tree. (1) `docs/architecture/system-overview.md`,
dated 2026-07-03, Vietnamese, a full architecture snapshot — spot-checked this session
against Prisma models, routes, module lists, and MCP tools: accurate everywhere checked.
Provenance unconfirmed (owner-written or another AI session). (2) `suggestions.txt`, an
external (codex) review of the product-roadmap draft — most of its suggestions have since
been absorbed into the roadmap (§7 evidence ledger, B4 migration strategy, C5 governance,
D1 audit log, §8 test plan) and several of its claims are now false ("Tenant… not in
source yet"), making it a live example of context-poisoning staleness.

## Problem

Untracked files are invisible to git history, excluded from review, and — in
system-overview's case — likely to be *found and trusted* by future AI sessions without
any governance metadata saying when it was true. I did not create either file, so
disposing of them is not mine to decide.

## Constraints

- Convention on record: stray unknown files are NOT committed silently (precedent:
  `structure.txt` explicitly excluded from an FB1 commit).
- The framework will govern architecture docs; whatever is adopted must enter that regime.
- `docs/` currently mixes Vietnamese product docs and English engineering docs;
  system-overview is Vietnamese (allowed under the language policy if classified as
  product/business-facing; misclassified if it is the engineering architecture reference).

## Options

### Option A — Adopt and govern system-overview; extract-then-delete suggestions.txt
Fully verify system-overview row-by-row, commit it as the architecture overview with
governance metadata (last-verified date, drift-check cadence), designating it the
successor/complement to the stale per-app ARCHITECTURE.md files (per ADR-0013). For
suggestions.txt: verify each item's absorption status, port any still-open item into the
roadmap or an ADR, then delete the file.

- **Pros:** highest-value doc enters the governed set instead of floating; the stale
  review file stops being discoverable poison; both outcomes align with the anti-drift
  mandate.
- **Cons:** requires the full verification pass (hours); commits a Vietnamese engineering
  doc unless translated/classified (see open question).
- **Affected areas:** `docs/architecture/`, roadmap doc (if items ported), git history.
- **Maintenance cost:** system-overview becomes a recurring drift surface — the archetypal
  state-doc — so it MUST carry a verification cadence or it becomes the next
  api/ARCHITECTURE.md.
- **Migration risk:** low; deletion of suggestions.txt loses nothing if extraction is done
  first (git never tracked it, so "history" is not at stake either way).

### Option B — Leave both untracked
Status quo: visible in the working tree, invisible to governance.

- **Pros:** zero effort; no wrong irreversible move.
- **Cons:** future sessions (like this one) will find and read both; suggestions.txt
  actively misinforms; system-overview silently rots with no last-verified marker;
  contradicts drift-as-first-class.
- **Maintenance cost:** hidden and growing.

### Option C — Discard both
Delete both files.

- **Pros:** clean tree.
- **Cons:** destroys the best current architecture snapshot (would need regeneration
  later at higher cost); destroys unextracted review items; destructive action on files
  I didn't create, against explicit provenance uncertainty.
- **Migration risk:** information loss, unrecoverable (untracked = no git safety net).

## Risks

- Adopting system-overview *without* the full verification pass would launder my
  spot-check confidence into document authority — the exact mechanism by which plausible
  stale docs gain trust. The verification pass is not optional in Option A.
- If the owner authored system-overview intentionally as a draft, adoption may preempt
  their plan for it — hence provenance must be confirmed first.

## Recommendation

**Option A**, contingent on the owner confirming provenance and intent. Objectively
stronger because both sub-decisions follow directly from the anti-drift mandate: a
high-quality doc outside governance is future drift, and a stale review file inside the
tree is present poison. B preserves both problems; C destroys value to solve a filing
problem.

## Confidence

High on suggestions.txt (its staleness is demonstrated). Medium on system-overview
(provenance unknown; owner may have other plans for it).

## Evidence

- Both files read in full this session; spot-check results as described.
- suggestions.txt stale claim example: "Tenant, Membership, UserRole… đều là planned,
  chưa tồn tại" — all exist in `schema.prisma` today (verified).
- Precedent for not committing stray files: FB1 session note on `structure.txt`.

## Open Questions

1. Who/what authored `system-overview.md`, and was it meant to be committed?
2. Language classification: is the architecture overview an *engineering* artifact
   (→ English per policy, i.e., translate on adoption) or a product-facing doc (stays
   Vietnamese)? Recommendation leans engineering→English, but the owner's policy wording
   leaves room.
3. Should the stale per-app ARCHITECTURE.md content merge INTO the adopted overview, or
   stay per-app with the overview linking down? (Interacts with ADR-0013.)
