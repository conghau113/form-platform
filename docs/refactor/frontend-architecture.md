# Frontend & app-layer architecture conventions

> Standing reference for every AI agent and human touching `apps/builder` and `apps/api`.
> The **package** layer (`packages/*`) is already small and well-factored — its rules live
> in [AGENTS.md](../../AGENTS.md) and the per-package `ARCHITECTURE.md`. **This document is
> about the two apps**, which is where the structural debt is.
>
> Read [AGENTS.md](../../AGENTS.md) first (golden rules: one JSON contract, additive schema,
> JSONLogic-not-eval, peer deps). Nothing here overrides those.

---

## 0. Why this doc exists

The repo scored ~7.5/10 in an external review. The package layer and the pure builder
`engine/` are genuinely good. The debt is concentrated in **two places**:

1. `apps/builder/src` **root** is a junk drawer — large feature files
   (`DesignCanvas.tsx` 812 LOC, `App.tsx` 604 LOC, `WorkflowEditor.tsx` 344 LOC,
   `Palette.tsx`, `ReactionsEditor.tsx`, `DataSourceEditor.tsx`, `ThemeEditor.tsx`,
   `TemplateGallery.tsx`, `templates.ts`, `io.ts`, `pins.ts`, `useDragon.ts`) sit at the
   top level next to already-foldered features (`field-registry/`, `PropertyPanel/`,
   `presets/`, `workspace/`, `workbench/`). Inconsistent and hard to navigate.
2. `App.tsx` is a **god component**: history + selection + clipboard + keyboard shortcuts +
   drag wiring + raw `fetch` save/load/theme + import/export + dirty tracking + layout.
3. The **data layer is hand-rolled** — every hook (`useProjects`, `useProjectTree`,
   `usePresets`, `useUserTemplates`) re-implements loading/error/`alive`-flag/refetch.

These conventions describe the target. The migration is sequenced in
[refactor-plan.md](./refactor-plan.md).

---

## 1. Reference standards we are aligning to

| Topic | Reference | What we take from it |
|---|---|---|
| Feature-folder structure, colocation | [bulletproof-react](https://github.com/alan2207/bulletproof-react) | Group by feature, not by file-type. A feature owns its components, hooks, api, types. |
| Server-state with react-query | [TanStack Query docs](https://tanstack.com/query/latest) + [TkDodo "Effective React Query Keys"](https://tkdodo.eu/blog/effective-react-query-keys) | Query-key factories, `invalidateQueries` over manual refetch, mutations with `onSuccess` invalidation. |
| NestJS module/DTO layering | [NestJS docs](https://docs.nestjs.com/) | Controller (HTTP) → Service (logic) → Repository (data). DTOs + `ValidationPipe` at the edge. |
| Form-builder domain | Formily (already referenced in `docs/expansion/`) | Schema-driven, pure transforms over the tree. |

We are **not** adopting full 4-layer DDD on the backend — it is overkill at this size and
the external review agreed. We keep the existing controller/service/repo split and tighten
it.

---

## 2. The non-negotiables (recap — see AGENTS.md for full text)

- The Zod schema in `packages/form-schema` **is** the contract. Never duplicate validation,
  conditions, or RBAC in an app or renderer.
- Changing the JSON shape ⇒ bump `CURRENT_FORM_VERSION` + migration + test. Additive optional
  props need no bump (see memory `form-platform-additive-schema-rule`).
- Conditional logic = JSONLogic via `form-core`. Never `eval()` / `new Function()`.
- `react`/`react-dom`/`antd` are **peer** deps in renderers — never in `dependencies`.

---

## 3. Builder (`apps/builder`) conventions

### 3.1 Organise by feature, not by file-type

Top-level `src/*.tsx` feature files are **banned**. Every feature is a folder with a barrel
`index.ts`. Target layout:

```
apps/builder/src/
  main.tsx                  # entry: providers (QueryClientProvider, Router, ConfigProvider)
  App.tsx                   # thin composition shell ONLY — layout + wiring (<200 LOC)

  app/                      # cross-cutting editor state, extracted out of App.tsx
    useFormEditor.ts        # history + selection + clipboard + derived schema/json
    useEditorShortcuts.ts   # the window keydown handler (undo/redo/copy/paste/move/delete)
    useFormPersistence.ts   # save/load form + theme  (react-query mutations)
    useNavigationGuard.ts   # dirty signal + beforeunload + provideSave plumbing

  canvas/                   # was DesignCanvas.tsx (812 LOC) — split:
    DesignCanvas.tsx        # the component
    DesignerContext.ts      # createContext + Provider + useDesigner (NOT in the .tsx)
    useDragon.ts            # moved from root (drag engine hook)
    index.ts
  palette/                  # Palette.tsx + PaletteChip.tsx
  reactions/                # ReactionsEditor.tsx
  datasource/               # DataSourceEditor.tsx + TreeOptionsEditor.tsx
  theme/                    # ThemeEditor.tsx
  templates/                # TemplateGallery.tsx + templates.ts
  workflow/                 # WorkflowEditor.tsx + workflow-model.ts
  lib/                      # tiny app utilities: io.ts, pins.ts

  query/                    # NEW — react-query infra
    queryClient.ts          # the singleton QueryClient + sensible defaults
    keys.ts                 # query-key factory (see §3.5)

  engine/                   # KEEP — pure, tested tree ops. Geometry helpers move HERE
                            # (edgeScroll/normalizeBox/boxesIntersect/springLoadTarget
                            #  currently live in DesignCanvas.tsx → engine/geometry.ts)
  field-registry/           # KEEP
  PropertyPanel/            # KEEP
  presets/                  # KEEP (migrate usePresets to react-query)
  workspace/                # KEEP (migrate hooks to react-query)
  workbench/                # KEEP
```

Tests stay **next to the file** they cover (`foo.ts` + `foo.test.ts`), as today.

### 3.2 File-size budgets (guidelines, not hard gates)

| Kind | Budget | Action when exceeded |
|---|---|---|
| React component `.tsx` | ~250 LOC | extract subcomponents / move logic to a hook |
| Hook `.ts` | ~150 LOC | it is probably doing two jobs — split |
| Pure module `.ts` | ~300 LOC | split by concern |
| Composition shell (`App.tsx`) | ~200 LOC | it should only wire, never compute |

These are smells, not lint errors. A cohesive 280-line component beats two artificially-split
ones. Use judgement, but justify anything well over budget.

### 3.3 One concern per file; pure logic is not React

- **Pure functions** (tree transforms, geometry, parsing, naming) live in `*.ts` with a
  colocated `*.test.ts`. They must not import React or antd. This is why `engine/` is the
  jewel of this codebase — keep adding to it.
- A `.tsx` file holds **React** (components, context). If you find an exported pure helper
  inside a `.tsx` (e.g. `edgeScroll` in `DesignCanvas.tsx`), that is a defect — move it to a
  `.ts` sibling/`engine/`.
- **React Context** gets its own file (`XContext.ts` / `XContext.tsx` if it needs JSX),
  never co-located inside a 500-line component.

### 3.4 Hooks: one responsibility, extracted from components

A component should read declaratively. When a component accumulates `useEffect` +
`useCallback` clusters that form a coherent job, extract a `useX` hook. Rules:

- Name `useThing`, return a typed object (not a positional tuple) once it has >2 members.
- A hook does **one** job. `useFormEditor` (editor state) and `useFormPersistence`
  (server I/O) are separate even though `App` uses both.
- Keep pure logic in plain functions the hook calls — the hook is the React-state shell only,
  exactly like `app/history.ts` wraps `engine/history.ts` today (good pattern, keep it).

### 3.5 Data fetching = react-query, always

We are adopting `@tanstack/react-query`. **No more hand-rolled `useState`+`useEffect`+`alive`
fetching.** Layering:

```
client.ts (transport)  →  query hooks (useQuery/useMutation)  →  components
```

- **`client.ts`** stays a thin transport module: one async function per endpoint, throws on
  non-OK with the server message. (The existing `workspace/client.ts` and `presets/client.ts`
  are already correct — keep them, they become the `queryFn`/`mutationFn` bodies.)
- **Query keys** come from a factory in `query/keys.ts`, never inline string arrays:
  ```ts
  export const qk = {
    projects: ["projects"] as const,
    projectTree: (id: string) => ["projects", id, "tree"] as const,
    presets: (projectId?: string) => ["presets", projectId ?? "global"] as const,
    form: (id: string) => ["forms", id] as const,
    theme: (id: string) => ["themes", id] as const,
  };
  ```
- **Reads** = `useQuery({ queryKey, queryFn })`. Loading/error come from the result — delete
  every `alive` flag and manual `loading` state.
- **Writes** = `useMutation({ mutationFn, onSuccess: () => qc.invalidateQueries(...) })`.
  Invalidate the affected keys; do **not** hand-write a `reload()` that the caller must
  remember to call.
- Raw `fetch` is allowed **only** inside a `client.ts` transport module. It must never appear
  in a component or `App.tsx` again (today `App.tsx` has inline `fetch` for save/load/theme —
  that moves into a `forms`/`themes` client + `useFormPersistence`).
- The injectable renderer `fetcher` (Track V2) is a separate concern — that is the *runtime*
  form's data source, not builder server-state. Don't conflate them.

### 3.6 Barrels & import conventions (per-package — do not mix)

- `apps/builder`: relative imports use **no extension**; a folder import resolves to its
  `index.ts` barrel (e.g. `../field-registry`, `./canvas`). Every feature folder exports its
  public surface through `index.ts` and nothing reaches into a sibling's internals.
- `packages/form-renderer-web` and `apps/api`: relative imports use explicit **`.js`**
  extensions (`NodeNext`). Don't copy builder's extensionless style there.

### 3.7 Styling

Prefer antd layout primitives (`Flex`, `Space`, `Row/Col`) and theme tokens over ad-hoc
inline `style={{...}}` objects. `App.tsx` currently hard-codes borders/paddings inline —
when you touch a block, lift repeated style objects to a `const` or a small CSS module
(the pattern already exists: `workbench/CompositePanel.css`).

---

## 4. Backend (`apps/api`) conventions

The layering is already sound — keep it, tighten three things.

### 4.1 Module / controller / service / repository

```
src/modules/<feature>/
  <feature>.module.ts       # wires controllers + providers
  <feature>.controller.ts   # HTTP edge ONLY: parse/validate input, call service
  <feature>.service.ts      # business logic, access checks (requireAccess), orchestration
  dto/                       # NEW — request DTOs (see 4.2)
src/persistence/
  repositories/<x>.repo.ts   # interface (the seam)
  prisma/prisma-<x>.repo.ts  # Prisma implementation
```

- Controllers never touch Prisma. Services never read `req`/`res`. Repos never contain
  business rules.
- Access control stays in the service (`ProjectsService.requireAccess(userId, id, role)`),
  not the controller.

### 4.2 Validate at the edge with DTOs

Form/theme bodies are validated by the contract's `migrate()` / `migrateTheme()` — keep that,
it is the right gate for contract data. But the **non-contract** endpoints (projects, folders,
members, preset metadata) currently accept raw `body`. Add `class-validator` DTOs +
a global `ValidationPipe({ whitelist: true })` so malformed workspace requests are rejected
at the boundary with a clear 400, not deep in a service.

### 4.3 Keep `ARCHITECTURE.md` current

[apps/api/ARCHITECTURE.md](../../apps/api/ARCHITECTURE.md) is **stale** — it still says
"file-backed only" and lists only forms/themes, but the app now has Prisma, a persistence
layer, and projects/folders/presets/members modules. A doc that lies is worse than no doc.
Update it in the same PR that changes structure.

---

## 5. Definition of done (every PR)

- `pnpm typecheck` green, `pnpm test` green.
- `pnpm biome check` clean **for the files you touched** (do not run `--write .` repo-wide —
  see memory `biome-not-clean-at-baseline`).
- A changeset for any changed **published** package (`packages/*`). `apps/*` are `private` —
  no changeset.
- For a **structural** refactor PR: **no behaviour change**. Tests that passed before pass
  after, unchanged. If a test must change, that PR is not "pure refactor" — call it out.
- Run the `reviewer` subagent before committing.

---

## 6. Quick decision guide

| I want to… | Do this |
|---|---|
| Add a builder feature | new folder under `src/` with `index.ts`; never a root `*.tsx` |
| Fetch/mutate server data | `client.ts` transport + a react-query hook + key from `query/keys.ts` |
| Add cross-field/runtime logic | a pure `.ts` in `engine/` (or the feature folder) + a `.test.ts` |
| Share editor state across panels | a `use*` hook in `app/`, or context in its own file |
| Add an API endpoint | `src/modules/<feature>/` with a DTO; register module in `app.module.ts` |
| Change the JSON shape | STOP — read the additive-schema rule; probably needs a migration |
</content>
</invoke>
