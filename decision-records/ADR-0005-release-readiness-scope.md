# ADR-0005: Release-readiness governance for a product that has never released

- **Status:** Accepted (owner, 2026-07-05) — Option C as recommended (thin grounded gate + blocker register; full governance deferred to the first real release; DoR gate for T3.5.1 now cleared)
- **Date:** 2026-07-03
- **Deciders:** Owner
- **Source:** Assumption register B2, F6

## Context

"Release readiness" is a mandated lifecycle stage of the framework. But the repo has never
released anything: **94 changeset files** are pending, all packages sit at 0.x and have
never been published, there is no `release.yml` (explicitly unchecked in the
production-hardening tracker), the current branch is 15 commits ahead of origin and
unpushed (push is deny-listed in settings — owner-gated), and no deployment beyond local
docker-compose exists. Every other strong-practice lifecycle stage (coding, review,
verification) can be *extracted* from repo history; this one cannot.

## Problem

The framework must say something about release readiness, but any detailed release
governance written now would be pure speculation — exactly the class of document
(state-doc with no grounding practice) that this repo's evidence shows rots fastest and
poisons future context.

## Constraints

- Owner mandate: framework covers the *complete* lifecycle, including release readiness —
  "nothing" is not an acceptable end state.
- Owner mandate: framework is generated from the repository, not templates.
- Anti-drift mandate: ungrounded aspirational docs are a drift liability.
- Changesets/versioning machinery already exists and is CI-enforced (changeset gate on PRs).

## Options

### Option A — Defer the stage entirely
Mark release readiness as an explicit stub ("no release practice exists; governance TBD at
first release") and move on.

- **Pros:** zero speculation; honest.
- **Cons:** leaves a mandated stage empty; the 94-changeset backlog and unpushed-branch
  state are *present* release risks that get no owner-visible handling; "TBD" stubs tend
  to stay TBD.
- **Affected areas:** none now.
- **Maintenance cost:** zero until it's suddenly urgent.
- **Migration risk:** none.

### Option B — Full aspirational release governance now
Write complete publish-pipeline policy, semver policy, deployment checklist, rollback
procedure, etc., before any release exists.

- **Pros:** stage looks complete.
- **Cons:** every unexercised procedure is a guess; guesses encoded as governance are
  authoritative-looking drift (worse than absence — future agents will *trust* them);
  contradicts the derive-from-repo mandate.
- **Affected areas:** new governance docs, likely a `release.yml`.
- **Maintenance cost:** high — unexercised procedures silently rot.
- **Migration risk:** first real release will rewrite most of it anyway.

### Option C — Thin grounded gate now; full governance ratified by the first real release
Now: extract a minimal release-readiness definition from what already exists and is real —
the verify bar (typecheck/test/biome/changeset/reviewer/live-smoke), CI green, changeset
hygiene — plus an owner-visible register of the *known release blockers* (94-changeset
backlog strategy, no publish workflow, unpushed branch policy). Later: the first actual
release (npm publish or client deployment) is treated as a framework event that produces
the full, evidence-grounded release governance.

- **Pros:** everything written now is grounded in current practice; present risks become
  visible decisions instead of silent debt; full governance arrives exactly when it can be
  validated.
- **Cons:** stage remains partially open until a first release happens; requires the owner
  to accept "thin now, complete later" as done-for-now.
- **Affected areas:** one governance doc + a blocker register; no pipeline changes yet.
- **Maintenance cost:** low; the thin gate reuses definitions that already exist.
- **Migration risk:** low — the thin gate is a subset of any future full policy.

## Risks

- The changeset backlog is a concrete time bomb under any option: the first
  `changeset version` will produce a massive multi-package version event whose shape
  (accept the big bang vs. squash/reset the backlog) is itself a decision no one has made.
- Unpushed-branch policy (15 commits, owner-gated push) is a single-machine
  data-loss exposure that release governance would normally cover; deferring entirely (A)
  leaves it unowned.

## Recommendation

**Option C.** Objectively stronger because it is the only option that satisfies all three
constraints at once: the stage is covered (unlike A), everything written is derived from
real practice (unlike B), and the two *present* release risks (changeset backlog,
unpushed-branch exposure) get an owner-visible home. A and B each violate one mandate
outright.

## Confidence

High on the option structure; the underlying facts (94 changesets, no publish, no deploy)
were verified this session.

## Evidence

- `ls .changeset/*.md` → 94 pending changesets (2026-07-03).
- All `packages/*` at 0.x; no publish workflow in `.github/workflows/` (5 workflows read).
- `production-hardening.md` line 95: `[ ] (Later) workflows/release.yml`.
- `git log origin/main..HEAD` → 15 unpushed commits; `git push` in settings deny list.

## Decision (2026-07-05)

**Option C accepted** by the owner (delegated approval of the recommendation). Two artifacts
are produced now, both grounded in current practice; full release governance is deferred until
a first real release can validate it:

1. **Thin release-readiness gate** — `knowledge/standards/release-readiness-standard.md` (L2,
   descriptive). It defines "release-ready" by *composing existing, exercised gates* — the verify
   bar, CI green, changeset consistency, reviewer, live-smoke — and points up to their normative
   homes (`dor-dod.md`, `verification-standard`, `gate-inventory`). It **originates no new rule**
   (constitution §2) and adds no pipeline.
2. **Release-blocker register** — `knowledge/registries/release-blockers.yaml` (L2,
   reference). An owner-visible, freshness-contracted list of the *present* release blockers so
   they are visible decisions, not silent debt.

**Re-grounded facts (2026-07-05, E1)** — the ADR's Evidence figures were re-verified against L0,
not copied: **94** pending changesets; **no** `release.yml` (5 workflows: ci/codeql/gitleaks/
sonarcloud/trivy); **47** commits ahead of `origin/main` (the ADR's "15" was 2026-07-03 — the
exposure has grown); all **10** `packages/*` at `0.1.0`, publishable, never published.

**Trigger for full governance:** the first real release event — an `npm publish` or a client
deployment — is treated as a framework event that produces the full, evidence-grounded release
governance (and, at that point, a superseding/expanding ADR). Until then the stage is
*intentionally* thin.

## Open Questions

The three below are **not resolved here** — Option C's purpose is to make them owner-visible
deferred decisions rather than silent debt. They are parked as open items in the blocker register
(`release-blockers.yaml`), each with an owner-decision trigger:

1. Changeset backlog strategy: accept one large version event, or reset/squash the 94-changeset
   backlog before first publish? (Owner decision, due before first `changeset version`.)
2. First "release" shape: npm publish (embeddable SDK path) vs client deployment (self-host path)?
   The thin gate's emphasis differs slightly. (Owner decision, due at first release intent.)
3. Push-cadence policy (how long commits may stay local-only): **parked, not adopted into the thin
   gate now.** The 47-commit unpushed exposure is *recorded* as a blocker; formalizing a cadence
   rule is left to owner choice so the thin gate stays purely extracted.
