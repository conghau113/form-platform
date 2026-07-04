# Calibration report — index freshness methods — 2026-07-04

> **Nature:** Evidence (append-only, §5) · **Date:** 2026-07-04 · **Author:** agent (Opus 4.8)
> **Method:** run every `knowledge/index.yaml` method once against L0 (E2 validation, roadmap E2 DoD) · **Result:** 8 run · 7 pass · 1 detector false-positive (fixed) · 0 real L0 drift
> **Evidence class:** E1 (each method executed)

First calibration of the freshness detector — the batch run that closes E2. Each method had been
calibrated at creation; this is the independent batch pass. A method that mis-fires on a known-good
artifact is a **detector bug**, fixed like any other (not a doc drift).

| index id | method run? | result | note |
|---|---|---|---|
| system-overview | ✅ | pass | 10 packages · 14 api modules · 17 repo interfaces · 21 prisma models |
| api-architecture | ✅ | pass | 14 modules · 17 repo interfaces · 17 Prisma impls · provider `postgresql` |
| builder-architecture | ✅ | **pass after fix** | feature folders all present; fetch-confinement method was a false-positive (see below) |
| usage-runbook | ✅ | pass | all 7 documented env vars present in `src/config/env.ts` |
| agents-guide | ✅ | pass | all 6 named packages exist |
| runbook-dev-stack | ✅ | pass | PORT 3001 · CORS 5173 · JWT≥16 · `postgres:16` · `${POSTGRES_PORT:-5435}:5432` · api dev = `tsc && node dist/main.js` |
| registry-model | ✅ | pass | roster `haiku`/`opus` matches `.claude/agents/*` · ADR-0011 names Fable 5 · tracker carries the policy |
| registry-gate-inventory | ✅ | pass | 5 workflows · 9 denies + PostToolUse hook · structure.test present |

## False positives (method flagged a correct artifact)

- **builder-architecture — fetch-confinement.** The method excluded only `apiFetch.ts`, so it
  false-flagged `apps/builder/src/auth/client.ts` — which is a **second, sanctioned** api-client file
  (the auth client; it legitimately calls `fetch(` for `/auth/login|register|logout`). The builder doc
  itself was correct ("fetch only in apiFetch + auth/client.ts"); the method's exclusion was too narrow
  (seeded by the T2.1.1 "sole file" wording).
  **Fix applied:** exclude both client files — `grep -vE 'apiFetch\.ts|client\.ts'` → returns clean.
  Also corrected the "sole file" wording in the `builder-architecture` index note + the
  `apps/builder/ARCHITECTURE.md` freshness stamp. No product code touched.

## False negatives (method missed real drift)

None observed.

## `verified-on` updates applied

None. This batch validated **method correctness**, not a full re-verification of each doc's prose;
the existing `verified-on` stamps (2026-07-03 for the E0-remediated docs; 2026-07-04 for the
E2-authored artifacts) stand.

## Drift findings filed

None. The single issue was a detector bug (fixed above), not L0 drift. (Separately, two findings were
already filed during E2 build and remain open remediation tasks: `production-hardening.md` "11 packages"
preamble is stale [truth 10]; `apps/api/.env.example` dotted is a stale SQLite-era duplicate of
`env.example`. Both are recorded in `knowledge/index.yaml`.)

## Verdict

The freshness detector is calibrated: all 8 registered methods run and pass on the current tree, with
one method corrected. **E2 validation complete → E2 DONE.**
