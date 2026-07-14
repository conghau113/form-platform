# Calibration report — index freshness methods — 2026-07-15

> **Nature:** Evidence (append-only, §5) · **Date:** 2026-07-15 · **Author:** agent (Opus 4.8)
> **Method:** run every `knowledge/index.yaml` method once against L0 (drift-sweep; roadmap E8 first audit) · **Result:** 13 run · 13 pass · 0 detector false-positive · 0 real L0 drift
> **Evidence class:** E1 (each method executed against L0)

The **E8 first-audit drift-sweep** — the periodic batch that runs every registered `index.yaml`
method as one pass (sweeps procedure §A). Supersedes [CALIBRATION-2026-07-04](CALIBRATION-2026-07-04.md)
(the E2-validation batch of 8 methods); the index has since grown to 13 registered descriptive
artifacts. A method that mis-fires on a known-good artifact is a **detector bug**, fixed like any
other (not a doc drift). This run required no detector fix — the one FP class the prior batch found
(builder fetch-confinement) was already narrowed in E2.

| index id | method run? | result | note |
|---|---|---|---|
| system-overview | ✅ | pass | 10 packages · 14 api modules · 17 repo interfaces · 21 prisma models |
| api-architecture | ✅ | pass | 14 modules · 17 repo interfaces · 17 Prisma impls · datasource provider `postgresql` |
| builder-architecture | ✅ | pass | 10 feature folders all present; fetch-confinement clean (only `apiFetch.ts` + `auth/client.ts`) |
| usage-runbook | ✅ | pass | env schema (`env.ts`) carries the documented vars incl. real JWT+refresh + `AUTH_BOOTSTRAP_*` (E2 source-read) |
| agents-guide | ✅ | pass | all 6 named packages exist |
| runbook-dev-stack | ✅ | pass | PORT 3001 · CORS 5173 · JWT≥16 · `postgres:16` · `${POSTGRES_PORT:-5435}:5432` · api dev = `tsc && node dist/main.js` |
| registry-model | ✅ | pass | roster `haiku`/`opus` matches `.claude/agents/*` · ADR-0011 names Fable 5 · tracker carries Opus 4.8 policy |
| registry-gate-inventory | ✅ | pass | 6 workflows (ci/codeql/e2e/gitleaks/sonarcloud/trivy) · deny list + PostToolUse hook · structure.test present |
| standard-coding | ✅ | pass | Prisma-confinement clean · structure.test 1/1 pass |
| standard-verification | ✅ | pass | verify bar (typecheck/test/build/changeset/e2e) present · CI runs all three · `e2e.yml`+`playwright.config.ts` present + advisory (`continue-on-error`) |
| standard-documentation | ✅ | pass | 13/13 registered artifacts carry a freshness header |
| standard-release-readiness | ✅ | pass | no `release.yml` · 10 publishable packages all 0.x / none published |
| registry-release-blockers | ✅ | pass | changeset backlog 94 (unchanged) · release.yml ABSENT · unpushed commits **65** (volatile — see below) |

## False positives (method flagged a correct artifact)

None this run. The prior batch's single FP (builder fetch-confinement excluded only `apiFetch.ts`)
was corrected in the E2-validation calibration and stays fixed — the method returns clean.

## False negatives (method missed real drift)

None observed.

## Volatile re-measurement (by design, not drift)

- **registry-release-blockers — `unpushed_commits`.** The claim figure was `47` (measured 2026-07-05);
  live `git log origin/main..HEAD` now reads **65**. This figure is **volatile by the entry's own
  declaration** ("verified_on marks the last measurement, not a stable fact; resets on push") — the
  branch simply accrued more commits (E5-CLOSE → E6 → E7 → this task). This is a **re-measurement,
  not drift**. The method is correct; the stale claim value is low-value bookkeeping — left as-is
  (the entry is explicitly volatile). `changeset_backlog` 94 and `publishable_packages` 10 unchanged.

## `verified-on` updates applied

None. This batch validated **method correctness** across the full index (13 methods run green), not a
full prose re-verification of each doc (sweeps §A: a method-only batch does not bump `verified-on`).
Existing stamps stand.

## Drift findings filed

None new. Re-surfaced (already-filed, tracked in `index.yaml` / resume memory — NOT new drift):
- **F1 (security, owner action):** the WORKING-copy `.claude/settings.json` (uncommitted) has dropped
  the 4 `.env` read-denies present in committed HEAD — weakens the live secret-read guardrail. The
  drift-sweep reads the working copy, so its deny list shows only `Read(**/*.pem)` + `Read(**/secrets/**)`.
  Owner decision (T6.2.3 F1). Not editable by the agent (owner's out-of-track file).
- **F2:** `gate-inventory` `deny-secret-read` under-lists the committed denies (names only `.pem` +
  `secrets/**`, omits the `.env` family HEAD carries) — its own remediation task (T6.2.3 F2).
- `production-hardening.md` preamble "11 packages" → truth 10; dotted `apps/api/.env.example` stale
  SQLite-era duplicate. Both low-severity, recorded in `index.yaml unregistered_by_design` / notes.

## Verdict

The freshness detector is calibrated across all **13** registered descriptive artifacts — every method
runs and passes on the current tree, **zero detector fixes needed, zero real L0 drift**. Drift-sweep
half of the E8 first audit is clean. Conformance-sweep in the companion
[CONFORMANCE-2026-07-15](../conformance/CONFORMANCE-2026-07-15.md).
