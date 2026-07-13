# Verification Standard

> **Artifact nature:** Descriptive (L2 — Knowledge). This standard *describes* how verification
> is actually performed in this repository — the concrete verify bar and the manual browser-smoke
> protocol. It does **not** originate rules (constitution §2). The normative "how the framework
> knows a claim is true" (evidence floors per claim, the 5-rule loop, confidence decay) lives at
> L1 in [`governance/policies/verification.md`](../../governance/policies/verification.md) and is
> **pointed to, not restated** (one home per rule). Extracted from L0 — `package.json`,
> `.github/workflows/ci.yml`, the `feature-module` skill, and the repeated live-smoke practice.
>
> **Freshness contract** (constitution §10; method authoritative in the index, not here):
> **class** E1 · **verified-on** 2026-07-14 · **cadence** re-verify when the verify-bar scripts,
> the CI verify job, or the automated e2e suite/gate (§5) change; else each release · **scope**
> `package.json`, `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `playwright.config.ts`.
> Registered as `standard-verification` in [`knowledge/index.yaml`](../index.yaml). Drift = finding
> (§10), filed — never patched inline.

---

## 1. How to read this standard

- **It is the operational layer over the L1 verification policy.** `verification.md` sets the
  *normative* floor per claim (behavior → E1, structure → E1|E2, …) and the 5-rule loop
  (investigate → reproduce → root-cause → verify-by-running → report-faithfully). This standard
  describes the *concrete mechanics* the repo uses to discharge those floors: which commands, and
  the manual browser smoke that turns a UI/behavior claim into E1.
- **Descriptive, extracted (constitution §2/§3).** Every command below is a fact about L0 that can
  drift; the freshness method re-verifies it. The *obligation* to run them is normative and lives
  in `dor-dod.md` (DoD) + `verification.md` §2 rule 4 — this standard does not re-decide it.

## 2. The project verify bar

The commands that discharge the "done" floor for a code change. Extracted from `package.json`
(E1) and mirrored in CI (gate-inventory).

| Step | Command | Discharges | Enforced |
|---|---|---|---|
| **Typecheck** | `pnpm typecheck` (`turbo run typecheck`) | structure/type correctness | CI `ci` job (rung 3) |
| **Test** | `pnpm test` (`turbo run test`); focused: `pnpm --filter <pkg> test` | behavior of tested paths (E1) | CI `ci` job |
| **Build** | `pnpm build` (`turbo run build`) | compiles; also the FROZEN native renderer's only guard (ADR-0006) | CI `ci` job |
| **Lint/format** | `pnpm biome check <touched files>` — **never `--write .` repo-wide** (baseline is not clean, ADR-0023) | style/lint on changed files | CI `ci` biome step (changed files) + PostToolUse hook |
| **Changeset** | `pnpm changeset` — required for any changed **published** package (`packages/*`); `apps/*` are ignored | release accounting | CI `changeset` gate (rung 3, packages/* only) |

- Package manager is **pnpm@9**; the monorepo runs through **Turborepo**, so the root scripts fan
  out per package and cache. Run the whole bar at the root; use `--filter` to scope during
  iteration, but the DoD is the *unfiltered* bar green.
- **`pnpm test` ≠ verified** for anything with browser behavior — see §4.

## 3. Evidence notation

How verification evidence is recorded so a later reader can trust (or re-check) it. The class
definitions (E1–E5) and floors are in constitution §7 + `verification.md`; this section only
describes the repo's *notation*, not the rules.

- **Tag claims with their class** when it matters: E1 (ran it now), E2 (read the L0 line), E3
  (derived). A behavior claim without an E1 observation is downgraded to "unverified", never
  stated as done (`verification.md` §1).
- **`live-smoke MCP PASS (<what was checked>)`** is the standing convention for recording a manual
  browser smoke (§4) in trackers/commit notes/memory — it names *what behavior was observed*, not
  just that "a smoke ran". A green unit suite is **not** written up as a passed smoke.
- **Report faithfully** (`verification.md` §2 rule 5): flaky / skipped / unverified is stated with
  the evidence. Never round "tests fail" or "didn't run it" up to "done".

## 4. Manual browser smoke (codified — MCP protocol)

The `feature-module` skill states it plainly: *drag, marquee, column-resize, spring-load, keyboard
nav, save/load are browser behaviours — green units do not prove the canvas still works.* This is
the codification of the repeated "live-smoke MCP" practice used across the product tracks. It needs
**no automated e2e infrastructure** and remains the E1 floor for the churn-prone surfaces automation
cannot reach (drag-drop canvas, visual UX). The automated critical-path suite that *complements* it
on the stable flows is **§5** (ADR-0008 Option C, landed in epic E7) — the two are siblings, not
substitutes.

**When it is required (the E1 floor for a behavior claim):** any change to UI interaction or
runtime behavior — editor canvas (drag/marquee/resize/keyboard nav), save/load, publish/submit,
workflow run, auth/login flows, responsive layout. Pure logic covered by a unit test does not.

**Protocol:**
1. **Bring the stack up** per [`runbook/dev-stack.md`](../runbook/dev-stack.md) — do **not** repeat
   its steps or gotchas here. Critical ones it owns: a live smoke runs the compiled `dist` (the api
   `dev` is `tsc && node dist/main.js`, no watch), so **rebuild after an api change and kill any
   server still bound to `:3001`** first; **rebuild a package's `dist`** after changing it or Vite
   serves the stale build; probe ports before starting (EADDRINUSE = already up).
2. **Drive the browser via MCP** — `chrome-devtools` or `playwright` tools: `navigate` to
   `http://localhost:5173`, `take_snapshot` to get the accessibility tree, then `click` / `fill` /
   `press_key` to exercise the path; `take_screenshot` for a visual check.
3. **Assert three things, not one:** (a) the behavior visibly happened (snapshot/screenshot shows
   the new state); (b) **the console is clean** (`list_console_messages` — no new errors); (c) the
   network/HTTP is correct where relevant (`list_network_requests` — the expected request fired and
   returned the expected status).
4. **Leave state clean** — a smoke that mutates data should note what it left behind, and confirm
   no false-dirty state (e.g. a Save button that should stay disabled).
5. **Record** as `live-smoke MCP PASS (<what was checked>)` (§3).

## 5. Automated critical-path e2e (Playwright — ADR-0008 Option C, epic E7)

A deliberately thin Playwright suite (`e2e/` + `playwright.config.ts` at the repo root — severable,
outside every package tsconfig) drives the docker-compose stack through a real browser in CI
([`.github/workflows/e2e.yml`](../../.github/workflows/e2e.yml), against `:8080`). It is the
**executable regression floor** the manual smoke (§4) cannot be — it re-verifies the stable,
high-value flows on *every* push, where manual smoke re-verifies earlier features only by accident.
It does **not** replace §4: the churn-prone surfaces stay on manual MCP smoke (ADR-0008 Risks C).

- **Covered flows (the critical path, ADR-0008 Decision Q1):** login/auth round-trip · create
  project/form · save/load form · publish version · submit + view submission · workflow run
  happy-path. Selectors are **by role/label/text only** — antd's DOM is churn-prone (ADR-0008 Risks).
- **Growth rule — "broken twice" (the anti-scope-creep guard, ADR-0008 Growth rule + Risks C):** a
  spec is added to this suite **only when a flow has broken twice** (evidence-driven, not
  aspiration-driven). This is what keeps Option C from decaying into Option B — an unpayable
  full-suite flake tax for a solo team. Adding a spec for a flow that has **not** demonstrably broken
  twice is speculation (constitution §14, minimum-viable) — don't.
- **Flake policy:** the suite runs `retries: 1` under CI and `--workers=1` (serial — one shared
  stack), both in `playwright.config.ts`. A flake is **not** a green (§3, report-faithfully): a spec
  that only passes on retry is recorded as flaky and is fixed or quarantined, never rounded up to
  "passing". Known pre-existing flakes are **named debt, not floor** — the theme-write
  characterization test and the containers test (ADR-0008 Context), and a `project-form-crud`
  reload load-race (seen at T7.2.3, passes on retry).
- **Promotion (advisory → blocking, constitution §8 advisory-first):** the gate is **advisory-first**
  — `e2e.yml` carries `continue-on-error: true`, so a failure is reported but does not fail the
  pipeline. §8 makes this mandatory (a new machine gate runs non-blocking ≥1 phase before it may
  block; a *blocking* gate is disabled only via a decision record). It is promoted to **blocking** —
  by dropping `continue-on-error`, itself a decision-record change — **only after N = 3 consecutive
  clean runs on `main`** (owner-set, T7.3.1). ⚠️ The count is currently **0**: the compose api
  crash-loops on empty `AUTH_BOOTSTRAP_*` (a filed product/infra finding, out of the E7 track), so the
  CI job has never booted green — the clock starts once that finding is fixed and the suite runs green
  in CI. Recorded as `ci-e2e` in [`registries/gate-inventory.yaml`](../registries/gate-inventory.yaml).

## 6. Extracted vs proposed

Everything above is **extracted** — the verify bar from `package.json`/CI, the smoke protocol from
the `feature-module` skill + repeated practice (seen many times across the workflow/product tracks;
promoted like any ≥2× fact), and (§5) the automated e2e suite + its `e2e.yml` gate, which now exist
in L0 after epic E7. **Zero proposed items.** The e2e growth rule and promotion criteria (§5) are
*governance choices recorded from ADR-0008 / constitution §8*, not proposed anew here — this standard
describes them, it does not re-decide them (constitution §2).

## 7. Definition of done (pointer)

The per-change "done" bar is `dor-dod.md` + the `feature-module` "before you say done" checklist:
the §2 verify bar green **plus** the §4 smoke where behavior changed, a changeset for any changed
published package, and — when the JSON contract shape changed — a migration + version bump + test.
See [`governance/policies/dor-dod.md`](../../governance/policies/dor-dod.md) and
[`governance/policies/verification.md`](../../governance/policies/verification.md).
