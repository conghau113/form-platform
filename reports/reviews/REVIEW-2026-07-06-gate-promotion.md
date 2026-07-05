# Review report — gate promotion (rung-1 prose rules) — 2026-07-06

> **Nature:** Evidence (append-only, §5) · **Date:** 2026-07-06 · **Reviewer:** main-session (Opus 4.8)
> **Method:** gate-promotion review — each rung-1/2 golden rule NOT already at rung-3 (per `knowledge/registries/gate-inventory.yaml`) × its **recorded violation evidence**, judged by climb-on-evidence (constitution §8) + minimum-viable-rung (§14). Evidence mined from `docs/expansion/*` + `docs/refactor/*` + `git log` + a current-code grep (this session, via the explorer agent). · **Result:** Reject-defer ALL — no rule crosses the climb threshold; WATCH-list only.
> **Evidence class:** E2 (recorded sightings) + E1 (current-code grep run this session)

This is the E6 entry review (T6.1.1). It reads the gate inventory and asks a single evidence question
per rule: **has it been violated enough to justify climbing a rung?** The enforcement ladder is
evidence-driven — a constraint climbs "with the violation as the justification (recorded, not
asserted)" (§8) and every constraint "start[s] at the lowest rung that works … climb only on
evidence" (§14). A rule that is never violated staying at prose is the *correct* state, not a gap.

## Scope — rules reviewed

The rung-1 (prose) product golden rules from AGENTS.md `## Architecture` + the `feature-module` skill +
the Global DoD, **excluding** what `gate-inventory.yaml` already records at rung-3/2:
`changeset` (ci-changeset, rung 3) and feature-folders (`structure.test.ts`, rung 2→3) are already
gated and out of scope. Six candidates remain.

## Evidence table

| # | Rule (rung-1) | Home | Recorded violations | ≥2×? | Gate feasibility |
|---|---|---|---|---|---|
| 1 | No `eval()` / `new Function()` on schema exprs | ADR-0015 | **0** — E4 T4.2.2 conformance-sweep dry-run reported "0 real violations" for `eval(` (`docs/expansion/ai-dev-framework.md:628–629`); grep of `packages/form-*/src` = 0 this session | No | **Cheap** — CI regex `\beval\(|\bnew Function\(` over `packages/*/src` (exclude tests/comments) |
| 2 | `react`/`antd`/`react-native` = peerDependencies | ADR-0016 | **0** — `form-renderer-web/package.json:28–33` + `form-renderer-native/package.json:24–26` all peer; no dep on them | No | **Cheap** — script asserts the 4 names stay in `peerDependencies` of renderer manifests |
| 3 | `fetch(` only in `client.ts` | feature-module #4 | **0** — refactor R5 verification `docs/refactor/refactor-plan.md:248` ("appears only in the 3 `*/client.ts`"); grep this session = 0 outside client.ts | No | **Cheap** — CI grep `fetch(` in `apps/builder/src` minus `**/client.ts` |
| 4 | No `any` in public APIs | AGENTS.md conventions | **0** — the only `any` is inside the Zod JSONLogic contract (`form-schema/src/schema.ts:29,47,106,193`), a legitimate data-shape, not a public signature | No | **Moderate** — must scope to barrel `index.ts` exports to avoid the legitimate schema-layer `any` |
| 5 | Additive schema: version bump + migration + test | ADR-0014 | **0** — 2 migrations present + tested (`form-schema/src/migrate.ts:20–44`, `migrate.test.ts`); never broke an old fixture | No | **Cheap-moderate** — detect a `CURRENT_FORM_VERSION` bump in a diff → require a matching migration + test |
| 6 | NestJS DI needs a **runtime** import (not `import type`) | house pattern (feature-module api layering) | **1×** — FS3a: `import type { ConfigService }` erased the DI metadata → app failed to boot; passed typecheck + 7 unit tests, caught only by live-smoke. Recorded: `docs/expansion/form-submission-runtime.md` (FS3a entry), framework tracker E5-CLOSE (`4b2b675`), product commit `ff61a6a` | No (1× < 2×) | **Moderate** — lint/AST: an `import type` symbol used as a constructor param type on an `@Injectable`/`@Controller` |

## Verdict — no promotion now (climb-on-evidence)

**Zero of the six candidates crosses the climb threshold.** Five have **no** recorded violation in the
entire tracked history (independently corroborated by the E4 T4.2.2 conformance-sweep, which found 0
real violations). One — rule 6 — has its **first** sighting (FS3a, this session), still **1× < ≥2×**,
and it was self-caught by the existing rung-4 signal (self-verify-by-running / live-smoke), i.e. the
ladder already caught it without a dedicated gate.

Per §8 (climb *on evidence*) + §14 (minimum-viable-rung, no speculative ceremony), **building a machine
gate for any of these now would be speculation, not enforcement** — the framework explicitly forbids
raising a rung under "downward pressure" without recorded violation (§8). The rules are clean because
they were *extracted from* the lived practice; the practice conforms.

This is itself a useful E6 result: it **prevents wasted gate-building** on non-problems and keeps the
E6 enforcement effort pointed where new, un-proven artifacts actually need it (below).

## WATCH-list (pre-analysis, NOT a build list)

Ranked by *if-a-violation-appears* priority = latent-severity × gate-feasibility × proximity-to-evidence,
so the promotion is pre-scoped the moment a first (or second) sighting lands:

1. **Rule 6 — NestJS runtime-import** — only candidate with any evidence (1×). A **second** sighting
   promotes it: cheapest correct gate is a lint/AST rule (moderate). WATCH — re-review at 2×.
2. **Rule 1 — no `eval()`/`new Function()`** — 0 violations but **catastrophic** latent severity
   (arbitrary code exec on schema-provided input) and the **cheapest** possible gate (one CI regex).
   The only candidate where §8's "governance may always override downward pressure to raise a rung"
   could justify a *severity-first* advisory gate ahead of evidence — **flagged as an owner call**, not
   recommended unilaterally (it would be the one deliberate exception to climb-on-evidence).
3. **Rule 3 — `fetch(` outside `client.ts`** — 0 violations, cheap grep gate; a partial structural
   analogue already exists (`structure.test.ts`), so this is a natural extension if drift appears.
4. **Rules 2 / 5 / 4** — 0 violations, feasible but lower proximity; hold at prose.

## Redirect — where E6 enforcement *should* go

The already-clean product rules are **not** where new gates are needed. The genuinely un-proven surface
is the **framework's own governance artifacts** — which is exactly what the existing T6.2.x tasks target
and this review **confirms**: `T6.2.1` index/freshness CI check, `T6.2.2` traceability/link check,
`T6.2.3` settings/hooks reconcile (rung-3 CI-preference). Those enforce new L2/L1 surface that has no
lived conformance history yet, so advisory-first gates there are warranted; gates on the product golden
rules are not.

- **Outcome:** Reject-and-defer all six product-rule promotions (no climb evidence). Adopt the WATCH-list
  as the standing pre-analysis; proceed with T6.2.x against the framework surface as already planned.
- **Follow-ups filed:**
  - Re-run this review when any WATCH item gets a fresh sighting (rule 6 is at 1×).
  - Owner decision open: whether rule 1 (`eval`) warrants the one severity-first advisory gate ahead of
    evidence (the deliberate §8 override). Default = no, hold at prose.
