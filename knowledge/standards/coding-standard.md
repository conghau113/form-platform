# Coding Standard

> **Artifact nature:** Descriptive (L2 — Knowledge). This standard *describes* how code is
> written in this repository; it does **not** originate rules (constitution §2 — lower layers
> never originate rules). Every constraint below traces **up** to its normative home (the
> constitution or an Accepted ADR) and **down** to the mechanism that enforces it (a CI/gate,
> the repo's structure, or review). Extracted from L0 — AGENTS.md, the `feature-module` skill,
> and the code itself — not from generic templates.
>
> **Freshness contract** (constitution §10; method is authoritative in the index, not here):
> **class** E1 · **verified-on** 2026-07-04 · **cadence** re-verify when the api persistence
> layering, the builder feature-folder rule, or an anchoring ADR (0006/0014/0015/0016/0019/0023)
> changes; else each release · **scope** `apps/api/src/**`, `apps/builder/src/**`,
> `packages/**`, `tsconfig.base.json`. Registered as `standard-coding` in
> [`knowledge/index.yaml`](../index.yaml); the executable re-verify method lives there.
> Drift in any described convention is a **finding** (§10), filed — never patched inline.

---

## 1. How to read this standard

- **It is descriptive, extracted from practice.** Each item states a convention the code
  already follows, then names its **authority** (where the rule is normatively decided) and its
  **enforcement** (what makes a violation fail or awkward — the enforcement ladder, §8). The
  standard is the *map*; the authority and the gate are the *territory*.
- **Natures are not mixed (§5).** This file asserts facts and points at rules and gates; it does
  not restate rule text (that lives in the ADR/constitution) and it does not embed the executable
  checks (those live in the index method + gate-inventory). This keeps every rule in one home.
- **Extracted vs proposed.** Everything below is **extracted** (grounded in L0 + an Accepted
  ADR). A convention that *should* exist but is not yet practiced or governed is **proposed** —
  it is filed for owner ratification (freeze rule §11), never invented inline. This pass adds
  **zero** proposed items (see §5).

## 2. Golden rules (architecture-level, non-negotiable)

These are the constraints from AGENTS.md "Architecture (non-negotiable)". Their normative force
lives at L1; this table is the extracted view with anchors. AGENTS.md itself becomes a pointer to
these authorities in E5 (T5.3.1).

| Convention | Authority (L1) | Enforcement (§8) | E1 evidence (2026-07-04) |
|---|---|---|---|
| **The JSON schema IS the contract.** `packages/form-schema` (Zod + inferred types) is the single source of truth; renderers *consume* it and never duplicate validation/logic. | AGENTS.md §Architecture (foundational, pre-ADR) | Prose + review; structural (validation lives only in form-schema/form-core) | — (architectural invariant) |
| **Additive schema; `formVersion` decoupled from npm version.** Changing the JSON shape requires `CURRENT_FORM_VERSION` bump + migration N→N+1 + a fixture-migration test. Older saved JSON never breaks. | **ADR-0014** | Machine gate: `form-schema` migration/fixture tests | `CURRENT_FORM_VERSION` in `packages/form-schema/src/schema.ts` |
| **Conditional logic is JSONLogic via form-core — never `eval()` / `new Function()`** on schema-provided expressions (they are DATA, evaluated server-side too → eval = RCE). | **ADR-0015** | Prose + no-eval sweep | Sweep clean — the only `eval(`/`new Function(` matches repo-wide are protective *comments* ("NEVER eval()"), zero real calls |
| **Framework libs are renderer peerDependencies.** `react`, `react-dom`, `antd`, `@ant-design/icons`, `@tanstack/react-query` are never `dependencies`, never bundled by a renderer. | **ADR-0016** | Build + peerDeps check | `packages/form-renderer-web/package.json`: the five are `peerDependencies`; `dependencies` = only `@org/*` + `react-hook-form`/`zod` |
| **`form-renderer-native` is FROZEN.** Reviews do not assess native parity; CI typecheck/build is its only guard; touching it requires an unfreeze decision (new ADR / owner sign-off). | **ADR-0006** | Prose + unfreeze gate; CI typecheck/build | (see AGENTS.md Conventions + `.cursor/rules/renderers.mdc`) |

## 3. Module & file conventions (house style)

Extracted from AGENTS.md "Conventions" + the `feature-module` skill + `tsconfig.base.json`.

### 3.1 TypeScript
- **`strict: true`; no `any` in public APIs.** — `tsconfig.base.json` (`strict=true`). No-`any`
  in public surface is a review rule (no gate).
- **`moduleResolution`:** `Bundler` at the base (`tsconfig.base.json`); **`apps/api` and
  `packages/form-renderer-web` override to NodeNext** and therefore use explicit **`.js`** import
  extensions. `apps/builder` uses no extension (folder import → its `index.ts`). Do not mix the
  two import styles within a package.

### 3.2 Package / module shape
- **Small, focused modules; public surface via a barrel `index.ts`.** Import a sibling feature
  through its barrel, never reach into internals. This keeps each file cheap for an agent to read.
- **One concern per file.** Pure logic → `*.ts` (+ `*.test.ts`, no React/antd import); React →
  `*.tsx`; context → its own file. An exported pure helper living inside a `.tsx` is a defect.

### 3.3 apps/builder (React + antd)
- **No top-level `apps/builder/src/*.tsx`.** Every feature is a *folder* with an `index.ts`
  barrel; only `App.tsx` and `main.tsx` are grandfathered at the root. — **Gate:**
  `apps/builder/src/structure.test.ts` (R7 guardrail, rung 3) fails loudly and names the offender.
- **Components are thin.** ~250 LOC component budget, ~150 LOC hook, `App.tsx` < 200 (wires only,
  never computes). Over budget ⇒ extract a hook or subcomponent. (Review rule.)
- **Server data = react-query.** `client.ts` is transport and the **only** place `fetch` is
  allowed → `useQuery`/`useMutation` hook → component; keys from `query/keys.ts`. Never
  reintroduce `useState`+`useEffect`+`alive`-flag fetching or a manual `reload()` — invalidate
  instead. — **Enforcement:** `fetch()` confinement is verified by the `builder-architecture`
  index entry (sanctioned files: `lib/apiFetch.ts` + `auth/client.ts`).

### 3.4 apps/api (NestJS)
- **Controller / service / repo layering + DTOs.** Controller = HTTP edge (validate via DTO,
  delegate); service = logic + access checks (`requireAccess`), calls a repo **interface**; repo
  holds no business rules. The controller never imports Prisma; the service never reads
  `req`/`res`. — Ref: `feature-module` skill; access-control posture in
  [`apps/api/ARCHITECTURE.md`](../../apps/api/ARCHITECTURE.md).
- **Prisma is confined to `persistence/prisma/`.** Data access goes through the repo interface in
  `persistence/repositories/`, implemented in `persistence/prisma/`; services depend on the
  abstract `*Repo`, never on the Prisma client. Two named carve-outs: `modules/health/`
  (liveness DB ping) and `scripts/` (one-off data import). — **Authority:** ADR-0019.
  **Enforcement:** the Prisma-confinement sweep (§4).
- **Non-contract bodies get a DTO + the global `ValidationPipe`** (projects/folders/members/
  preset metadata). Form/theme bodies stay validated by `migrate()`/`migrateTheme()`.

### 3.5 Tooling
- **Biome is scoped, never repo-wide `--write`.** The baseline is not clean, so formatting/lint is
  applied only to touched files (the PostToolUse hook biomes the edited file). — **Authority:**
  ADR-0023. **Enforcement:** hook + `ci` biome gate (see gate-inventory).
- **Changeset per changed *published* package** (`packages/*`); `apps/*` need none. — DoD gate
  (prose rung 1 + `ci` changeset gate rung 3).

## 4. Conformance sweeps (the two this standard owns)

These are periodic, repo-wide checks that the described conventions still hold (§9 conformance;
distinct from the per-diff reviewer). They are the executable `method` of the `standard-coding`
index entry; the precise command + expected result live there. Both ran **green on 2026-07-04**:

1. **Prisma-confinement.** Raw Prisma access (`this.prisma.`) appears only under
   `persistence/prisma/` + the two carve-outs (`modules/health/`, `scripts/`) → **clean**
   (empty). *Method note:* match the `this.prisma.` **access** signal, not `PrismaService`
   imports — the latter false-flags DI wiring (`persistence.module.ts`) and a doc-comment in
   `health.module.ts`. (Calibrated this pass; false-positive narrowed per `sweeps.md`.)
2. **Builder feature-folder guardrail.** `apps/builder/src/structure.test.ts` → **pass** (no
   stray root `*.tsx` beyond `App.tsx`/`main.tsx`). This standard defers to the existing gate
   rather than re-implementing a folder check (one home per rule).

## 5. Extracted vs proposed

Every convention above is **extracted** — grounded in L0 and, where a rule is involved, in an
Accepted ADR. **No proposed (not-yet-practiced) rules are added in this pass.** If a future
extraction surfaces a convention worth mandating that L0 does not yet follow, it is filed as a
proposal for owner ratification (freeze rule §11), never asserted here as if already binding.

## 6. Definition of done (pointer)

The per-change "done" bar is the DoR/DoD policy + the `feature-module` checklist: `pnpm
typecheck` + `pnpm test` green, `biome check` clean on touched files, a changeset for any changed
published package, the relevant browser smoke where behaviour changed, and — when the JSON
contract shape changed — a migration + version bump + test. See
[`governance/policies/dor-dod.md`](../../governance/policies/dor-dod.md).

---

*Validation (E3): applied to a real diff — P1b responsive-editor commit `c90eb86` touches only
feature-folder files (`workbench/`, `workspace/`) plus the grandfathered `App.tsx`, adds no root
`*.tsx` and no `fetch`; it satisfies §3.2–§3.3. The two §4 sweeps applied to the current tree are
both clean.*
