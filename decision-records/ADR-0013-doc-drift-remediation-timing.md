# ADR-0013: Timing of documentation-drift remediation

- **Status:** Accepted (owner, 2026-07-03) — recommendation as written, via blueprint & roadmap approval
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register E1

## Context

The audit produced a verified drift inventory. Badly stale: `apps/api/ARCHITECTURE.md`
(claims SQLite, `x-owner-id` trust seam, "real auth arrives in Phase 2" — all false;
endpoint list missing ~7 shipped modules: auth, rbac, tenants, org-units, submissions,
workflows/instances, form-versions, status-catalog, ai). Partially stale:
`apps/builder/ARCHITECTURE.md` (missing `auth/`, `admin/`, `shell/`, `submissions/`,
`versions/`, `ai/` feature folders), `docs/usage.md` (stale auth note, stale test counts),
`docs/expansion/production-hardening.md` (2C/2D superseded by Phase B3/C, untracked).
Accurate: AGENTS.md, repo-map skill, cursor rules (invariant-class docs). The framework's
mandate makes drift first-class; the question is only *when* the known instances get fixed.

## Problem

Every session between now and remediation — including the framework design sessions
themselves — reads these files as authoritative context. This audit was itself briefly
misled by `apps/api/ARCHITECTURE.md` before Prisma/source reads corrected it. Stale
authoritative-looking docs are the highest-leverage poison in the repo right now.

## Constraints

- Per-phase workflow: remediation would be a normal phase (verify → commit → tracker).
- ADR-0007 interacts: whether `system-overview.md` is adopted changes what the per-app
  docs need to contain (overview may absorb some content).
- The framework's drift *detector* does not exist yet; building it first is a real option.
- Remediation must itself be verified (docs re-checked against source), or it just
  refreshes the drift with new errors.

## Options

### Option A — Remediate now, before framework design
A standalone phase: fix the four identified docs against source (the audit already did
most of the verification legwork), stamp each with a last-verified date, commit.

- **Pros:** immediately raises the context floor for every subsequent session — including
  the highest-stakes ones (framework design); bounded, small cost (hours — the discovery
  is already done, only the writing remains); gives the future detector a known-good
  baseline (its first run should find ~nothing, a testable expectation).
- **Cons:** manual remediation without tooling; the fixes themselves could contain errors
  (mitigated by the verify-against-source rule and reviewer pass).
- **Affected areas:** `apps/api/ARCHITECTURE.md`, `apps/builder/ARCHITECTURE.md`,
  `docs/usage.md`, `docs/expansion/production-hardening.md` (+ ADR-0007 outcomes).
- **Maintenance cost:** none beyond normal doc upkeep.
- **Migration risk:** low; pure doc changes, no code.

### Option B — Detector first, dogfood the fixes
Build the framework's drift-detection capability, then let its first run identify and fix
these (and any unknown) instances.

- **Pros:** dogfooding — the known instances become the detector's acceptance test; catches
  drift the manual audit missed.
- **Cons:** leaves verified poison in place for the weeks the framework build takes, and
  those weeks are exactly when sessions lean hardest on architecture docs; conflates two
  deliverables (detector correctness is easier to judge against a *clean* baseline plus
  deliberately seeded drift than against a dirty one).
- **Maintenance cost:** same eventual work, deferred.
- **Migration risk:** sessions in the interim may propagate stale claims into new
  artifacts (e.g., an ADR citing the "no auth yet" line) — drift metastasis.

### Option C — Lazy per-touch remediation
Fix a doc only when a task touches its area.

- **Pros:** cost amortized; no dedicated phase.
- **Cons:** unpredictable completion (the api ARCHITECTURE.md drift accumulated precisely
  because no task "owned" it); partial fixes create mixed-freshness docs that are harder
  to trust than uniformly dated ones; contradicts drift-as-first-class.
- **Maintenance cost:** hidden, perpetual.

## Risks

- (A) Scope creep: remediation must not silently become "rewrite all docs" — it fixes the
  four identified files against current source, nothing more (ADR-0007 handles the
  overview question separately).
- (B)'s metastasis risk is not hypothetical: `suggestions.txt` already demonstrates a
  document inheriting claims that were true at write-time and false now.
- The deeper systemic fix (docs carrying verification metadata, detector cadence) belongs
  to the framework proper under any option — this ADR only sequences the known instances.

## Recommendation

**Option A.** Objectively stronger because the cost asymmetry is decisive: A's cost is
small, bounded, and mostly already paid (the audit found and verified the deltas), while
B's cost — context poisoning during the framework's own design — is unbounded and
compounding, and C has been empirically tried by default and produced the current state.
A also strictly improves B's dogfooding story rather than weakening it: a clean baseline
plus deliberately seeded test drift is a better detector acceptance test than an
uncontrolled dirty state.

## Confidence

High. The drift inventory is verified fact; the sequencing argument rests on it directly.

## Evidence

- Drift inventory verified by direct reads, 2026-07-03 (this session): stale claims
  enumerated per file above, each cross-checked against `schema.prisma`, module listing,
  and shipped-phase commits.
- Metastasis example: `suggestions.txt` (see ADR-0007).
- Invariant-vs-state doc pattern: AGENTS.md/cursor rules accurate while per-app
  ARCHITECTURE.md rotted — the remediation should note *why* each doc rotted (no
  owner/cadence) as input to the framework's later systemic design.

## Open Questions

1. Should remediation land as its own commit/phase before ADR review of the framework
   design starts, or bundled with the ADR-0007 adoption work (they touch the same files)?
2. Language: `apps/api/ARCHITECTURE.md` and `apps/builder/ARCHITECTURE.md` are English
   today — confirm they stay English (engineering artifacts) while `docs/usage.md` stays
   Vietnamese (operational runbook — product-facing)?
