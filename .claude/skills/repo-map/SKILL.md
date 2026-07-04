---
name: repo-map
description: Map of the form-platform monorepo — which package/app owns what, where the large modules live, and the golden rules (additive schema, formVersion, one contract many renderers). Read this FIRST when locating code or planning a change instead of scanning large files.
---

# form-platform repo map

> **Layer:** L3 — Execution Adapter (skill binding). Originates no rule (constitution §2); for anything
> normative it points to the source. On a source change this binding is stale (E5 discipline).
> **Source:** L0 `packages/`+`apps/` · [`docs/architecture/system-overview.md`](../../../docs/architecture/system-overview.md) ·
> each app's `ARCHITECTURE.md` · [`AGENTS.md`](../../../AGENTS.md) Layout. The **golden rules** below are
> L1-normative — constitution + ADR-0014 (additive schema) / 0015 (no-eval) / 0016 (renderer peerDeps) /
> 0006 (native freeze); restated here only as a navigation digest.
> **Regenerated:** E5 T5.1.1 · 2026-07-05 — refreshed to current L0 (PostgreSQL not SQLite; native FROZEN;
> Biome scoped per ADR-0023).

Schema-driven form (and later workflow) builder. **One versioned JSON contract drives
many renderers.** Use this map to jump straight to the right file. Each package/app has
its own `ARCHITECTURE.md` with a file-by-file table — open that for detail.

## Golden rules (non-negotiable)
- The JSON schema IS the contract. `packages/form-schema` (Zod + inferred types) is the
  single source of truth. Renderers/builder CONSUME it; never duplicate validation,
  conditions, or RBAC in a renderer.
- `formVersion` is decoupled from npm version. Changing the JSON shape requires: bump
  `CURRENT_FORM_VERSION` + add a migration N→N+1 + a test migrating an old fixture.
  **Never break older saved JSON.** (See memory `form-platform-additive-schema-rule`.)
- Conditional logic uses JSONLogic via `form-core` — never `eval()`/`new Function()`.
- `react`/`react-dom`/`antd`/`react-native` are peerDependencies in renderers — never
  bundle them.

## Packages (`packages/`) — already small/modular, leave structure alone
| Package | Owns |
|---|---|
| `form-schema` | contract: types, Zod, `CURRENT_FORM_VERSION` + migrations (`schema.ts`, `containers.ts`, `migrate.ts`) |
| `form-core` | shared runtime: JSONLogic conditions, RBAC, reactions, datasource, validation→Zod, async-validator |
| `form-theme` | design tokens + antd theme mapping + theme migrations |
| `form-renderer-web` | antd renderer (responsive 24-col). **Split into `controls/`, `preview/`, `containers/`, `internal/` + `FormRenderer.tsx`** — see its `ARCHITECTURE.md` |
| `form-renderer-native` | React Native renderer — **FROZEN** (ADR-0006; web-first) |
| `workflow-schema` / `workflow-core` | state-machine contract + engine (early) |

## Apps (`apps/`)
| App | Owns |
|---|---|
| `builder` | drag-drop editor (Vite). **Every feature is a folder** (only `App.tsx` + `main.tsx` at root): `editor/` (state + persistence hooks + the form/theme `client.ts`), `canvas/`, `palette/`, `presets/`, `workspace/`, `query/` (react-query), `theme/`/`templates/`/`workflow/`/`datasource/`/`reactions/`/`lib/`, plus `field-registry/` + `PropertyPanel/`. Server state via react-query (`fetch` only in `client.ts`). See `apps/builder/ARCHITECTURE.md` |
| `api` | NestJS backend, **Prisma** (PostgreSQL) behind repo interfaces. Controller→service→repo layering; **feature modules under `src/modules/<feature>/`** with DTOs in `dto/` for non-contract bodies + global `ValidationPipe`; RBAC via `ProjectsService.requireAccess`. See `apps/api/ARCHITECTURE.md` |

## "I need to change X" → go here
- A leaf control's antd UI → `packages/form-renderer-web/src/controls/FieldControl.tsx`
- How options load from a remote dataSource → `controls/useRemoteOptions.ts`
- Array list / wizard layout → `packages/form-renderer-web/src/containers/`
- Add a new field type → `apps/builder/src/field-registry/registry.ts` (+ schema + renderer control)
- The right-hand property editor → `apps/builder/src/PropertyPanel/` (pick the sub-editor)
- Validation rules → contract `form-schema/schema.ts` + compile `form-core/validation.ts`
- A backend endpoint → `apps/api/src/modules/<feature>/`

## Per-package import conventions (don't mix them up)
- `form-renderer-web`: relative imports use explicit **`.js`** extensions.
- `apps/builder`: relative imports use **no extension**; a folder import resolves to its
  `index.ts` barrel (e.g. `../field-registry`, `./PropertyPanel`).
- `apps/api`: `module: NodeNext` → explicit **`.js`** extensions.

## Commands
- `pnpm typecheck` · `pnpm test` · `pnpm build` (turbo)
- `pnpm biome check <touched files>` — lint + format on changed files only; never `--write .` repo-wide (ADR-0023, baseline is not clean)
- `pnpm changeset` — record a bump for any changed PUBLISHED package (`apps/*` are
  `private`, no changeset needed). Definition of done: typecheck + test + biome clean +
  changeset for changed packages.
