# Release-Readiness Standard (thin gate)

> **Artifact nature:** Descriptive (L2 — Knowledge). This standard *describes* what
> "release-ready" means in this repository **today**, by composing gates that already exist and
> are exercised every phase. It **originates no rule** (constitution §2): the per-change
> obligations live at L1 in [`dor-dod.md`](../../governance/policies/dor-dod.md) +
> [`verification.md`](../../governance/policies/verification.md), and the concrete gates are
> catalogued in [`verification-standard`](./verification-standard.md) +
> [`gate-inventory`](../registries/gate-inventory.yaml) — all **pointed to, not restated**.
>
> **It is deliberately thin.** Per [ADR-0005](../../decision-records/ADR-0005-release-readiness-scope.md)
> (Accepted, Option C), full release governance — publish pipeline, semver policy, deployment
> checklist, rollback — is **not** written here, because nothing has ever been released and any
> such procedure would be ungrounded speculation (the drift class this framework exists to
> prevent). The *first real release* is the framework event that produces that governance. Until
> then this standard covers only the release bar that is already real, and the present blockers
> are tracked in [`release-blockers.yaml`](../registries/release-blockers.yaml).
>
> **Freshness contract** (constitution §10; method authoritative in the index, not here):
> **class** E1 · **verified-on** 2026-07-05 · **cadence** re-verify when `release.yml` appears,
> the changeset config changes, or a package is first published — **and this standard must
> graduate** (thin → full) the moment a real release happens · **scope** `.github/workflows/`,
> `.changeset/`, `packages/*/package.json`. Registered as `standard-release-readiness` in
> [`knowledge/index.yaml`](../index.yaml). Drift = finding (§10), filed — never patched inline.

---

## 1. How to read this standard

- **"Release-ready" here = the existing "done" bar applied to the whole tree, plus release
  accounting consistency.** There is no separate, heavier release ceremony today, and this
  standard invents none. It names the checks that *are* run and points to their homes.
- **Thin by decision, not by omission (ADR-0005 Option C).** The gaps below (§4) are known and
  owned in the blocker register, not silently missing. When the first release exists, this file
  is superseded/expanded by evidence-grounded governance — see the freshness cadence above.

## 2. The thin release gate

A change set is "release-ready" when **all** of the following hold. Each row points to where the
check already lives; none is re-decided here.

| # | Gate | What it means | Home (pointer) |
|---|---|---|---|
| 1 | **Verify bar green** | `pnpm typecheck` · `pnpm test` · `pnpm build` all pass at the root (unfiltered) | [`verification-standard` §2](./verification-standard.md) · [`gate-inventory`](../registries/gate-inventory.yaml) `ci-{typecheck,test,build}` |
| 2 | **Lint/format clean on touched files** | `pnpm biome check <touched>` — never `--write .` repo-wide (ADR-0023) | `verification-standard` §2 · `gate-inventory` `ci-biome` |
| 3 | **Changeset accounting consistent** | every changed **published** package (`packages/*`) has a changeset; `apps/*` are ignored | [`dor-dod.md`](../../governance/policies/dor-dod.md) (DoD) · `gate-inventory` `ci-changeset` |
| 4 | **CI green** | the checks above plus `codeql` / `gitleaks` / `trivy` pass on the PR | `gate-inventory` `ci-*` |
| 5 | **Reviewer + live-smoke where behavior changed** | isolated reviewer PASS per the routing matrix; manual MCP browser-smoke for any UI/runtime change (E1) | [`review-workflow.md` §2](../../governance/policies/review-workflow.md) · `verification-standard` §4 |
| 6 | **Security scanners not regressed** | `codeql` / `gitleaks` / `trivy` clean; `sonarcloud` is advisory (no-ops until `SONAR_TOKEN`) | `gate-inventory` `ci-{codeql,gitleaks,trivy,sonarcloud}` |

This is the *same* per-change "done" bar (`dor-dod.md`) read at release altitude: a release is
ready when everything intended for it is individually done, CI is green, and the changeset ledger
is consistent with what changed. Nothing above is new machinery.

## 3. What a "release" is today (grounded)

- **Publish surface:** all **10** `packages/*` are at `0.1.0`, `publishable` (none `private`), and
  **never published** — no package exists on any registry yet.
- **Pipeline:** there is **no** `release.yml`; the 5 workflows are `ci` / `codeql` / `gitleaks` /
  `trivy` / `sonarcloud`. Versioning machinery (`@changesets/cli`) exists and the changeset gate is
  CI-enforced, but no automated `changeset version` → publish path is wired.
- **Deployment:** nothing beyond local `docker-compose` (see [`runbook/dev-stack.md`](../runbook/dev-stack.md)).
- **Distribution readiness:** the branch is owner-gated (push is deny-listed) and currently **47**
  commits ahead of `origin/main` — recorded as a blocker, not a normal release state.

Because none of a publish pipeline, a deploy target, or a semver-in-anger policy has been
*exercised*, this standard does not describe them. They are the deferred half of ADR-0005.

## 4. Known blockers (pointer)

The *present* release risks are not restated here — they live, with live counts and owner-decision
triggers, in [`release-blockers.yaml`](../registries/release-blockers.yaml): the 94-changeset
backlog "big bang", the missing publish pipeline, and the unpushed-branch data-loss exposure, plus
the three ADR-0005 open questions (backlog strategy · npm-vs-deploy · push-cadence).

## 5. Extracted vs proposed

Everything above is **extracted** — the gate rows compose gates that already run
(`package.json` / CI / the policies). **Zero proposed items.** Full release governance (publish
pipeline, semver policy, deployment/rollback) is deliberately **not** proposed — ADR-0005 defers it
to the first real release, which will produce it with evidence instead of speculation.
