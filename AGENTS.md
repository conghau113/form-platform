# Form Platform — agent guide

Schema-driven form (and later workflow) builder. One versioned JSON contract
drives many platform renderers. Read this fully; it is the single source of truth
for every AI agent working in this repo.

> **Freshness contract (descriptive surface only).** This file mixes normative rules with
> descriptive facts. Its **descriptive** surface — the `## Layout` package roster + folder
> structure — is registered in [`knowledge/index.yaml`](knowledge/index.yaml) as `agents-guide`
> (**class** E1 · **verified-on** 2026-07-03 · **cadence** on any package add/remove/rename;
> **method** in the index: each named package dir exists). Its **normative** golden rules
> (`## Architecture`) are L1-governed (constitution + ADR-0006/0014/0015/0016) and now carry
> pointers to their L1 home (E5 T5.3.1) — the authority lives there, edit the rule there not here.
> Drift in the descriptive surface = defect: file it, do not silently patch (constitution §10).

## Architecture (non-negotiable)
These restate rules that originate at L1 (constitution §2: lower layers never originate rules);
each carries a pointer to its normative home. Change a rule at the home, then reflect it here.
- The JSON schema IS the contract. `packages/form-schema` (Zod + inferred types)
  is the single source of truth. Renderers CONSUME it; never duplicate validation
  or logic inside a renderer. (→ `governance/constitution.md` §1 self-similarity)
- `formVersion` is decoupled from the npm package version. Changing the JSON shape
  requires: bump `CURRENT_FORM_VERSION` + add a migration N->N+1 + a test that
  migrates an old fixture to current. NEVER break older saved JSON. (→ ADR-0014)
- One schema, many renderers. Shared behavior (migrate, conditional logic, RBAC)
  lives in `packages/form-core`. Only the leaf component mapping + layout
  interpretation is platform-specific. (→ `governance/constitution.md` §1 self-similarity)
- Conditional logic uses JSONLogic via form-core. NEVER eval() / new Function()
  on schema-provided expressions. (→ ADR-0015)
- `react`, `react-dom`, `antd`, `react-native` are peerDependencies in renderers.
  Never add them as dependencies; never bundle them. (→ ADR-0016)

## Layout
```
packages/
  form-schema       contract: types, Zod, formVersion + migrations (zod only, tiny)
  form-core         shared runtime: JSONLogic conditions, RBAC, registry interface
  form-renderer-web    antd renderer, responsive (24-col xs/sm/md/lg)
  form-renderer-native React Native renderer, single column — FROZEN, deferred (ADR-0006)
  workflow-schema   (later) state machine contract; nodes reference forms by id
  workflow-core     (later) engine, runs on FE AND NestJS BE
apps/
  builder           the drag-drop editor, hosted once (Vite + antd + dnd-kit)
```

## Conventions
- TypeScript strict. No `any` in public APIs. `moduleResolution: bundler`.
- Small, focused modules. Public surface via barrel `index.ts`. This keeps each
  file cheap for an agent to read.
- Tooling: pnpm + Turborepo, Biome (lint+format), Vitest (test), Changesets (release).
- Renderer changes must be ADDITIVE — older schema versions keep rendering.
- `form-renderer-native` is FROZEN (ADR-0006): reviews do NOT assess native parity; CI
  typecheck/build is its only guard. Its conventions (single column, `hideOnMobile` /
  `mobileOrder`) are preserved for future resumption. Any commit touching the package
  requires an explicit unfreeze decision first — a new ADR or owner sign-off.
- App structure: each app has an `ARCHITECTURE.md` (`apps/builder`, `apps/api`); the conventions +
  phased plan live in `docs/refactor/{frontend-architecture,refactor-plan}.md` and the
  `feature-module` skill. Builder = feature folders (no new root `src/*.tsx`) + react-query
  (`fetch` only in `client.ts`); api = controller/service/repo + DTOs for non-contract bodies.

## Commands
- `pnpm install` · `pnpm build` (turbo) · `pnpm typecheck` · `pnpm test`
- `pnpm biome check --write .` — lint + format
- `pnpm changeset` — record a version bump before any package change is "done"

## Definition of done
typecheck passes, tests pass, biome clean, and a changeset exists for any changed
package. Verify these yourself before reporting completion.
