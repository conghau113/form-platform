# Next direction — execution plan (V2 → R2 → R7)

> Detailed, trackable plan for the post‑G3/U1 direction decided 2026‑06‑18 (see the
> "Re‑prioritisation" section in `builder-ux-field-parity-v2.md`). Order by leverage ÷ cost:
> **V2 (renderer fetcher) → R2 (Display Text) → R7 (Form Layout)**, then i18n (separate track).
> Tick the checkboxes as each step lands. Each phase is its own branch + commit(s) + changeset.

## How to track progress
- **This file** — the source of truth for status; tick boxes + fill the commit hash per phase.
- **Git** — one branch per phase off `main` (or chained); `git log --oneline main..`.
- **Tests** — `pnpm typecheck`, `pnpm --filter <pkg> test`; every phase must stay green.
- **App** — `pnpm --filter builder dev` to see R2/R7 chips live (V2 is API‑only → seen via tests).

Status legend: ⬜ todo · 🟡 in progress · ✅ done.

---

## Phase V2 — Injectable `fetcher` in the web renderer  ✅
**Branch:** `feat/v2-renderer-fetcher` · **Packages:** `form-renderer-web` (published → changeset)

**Why:** The renderer can't add auth headers / a custom base to its remote calls (dataSource
options + async value checks). Today `FormRenderer` has no `fetcher` prop and
`useRemoteOptions.ts:38` uses the global `fetch`. Both core sinks already accept an injectable
`fetchImpl` — so this is a pure wire‑through. This is the real blocker for embedding the
renderer in an authenticated host app.

**Design:** add `FormRendererProps.fetcher?: typeof fetch`. Provide it through a small React
context so option controls read it without prop‑drilling; pass it directly into the async
resolver (which already lives in `FormRenderer`'s closure). Default = global `fetch` ⇒ **runtime
unchanged** when the prop is absent.

**Steps**
- [x] `FormRenderer.tsx` — add `fetcher?: typeof fetch` to `FormRendererProps`; destructure it.
- [x] New `internal/FetcherContext.ts` — `createContext<typeof fetch | undefined>(undefined)`
      + a `useFetcher()` helper (falls back to global `fetch`).
- [x] `FormRenderer.tsx` — wrap the form body in `<FetcherContext.Provider value={fetcher}>`
      (inside the existing `QueryClientProvider`/`ConfigProvider`).
- [x] `controls/useRemoteOptions.ts` — read `useFetcher()`; pass it as the 3rd arg of
      `fetchDataSourceOptions(ds, depValues, fetcher)`. Kept OUT of the react‑query `queryKey`
      (same url/deps ⇒ same options regardless of fetch impl).
- [x] `internal/resolver.ts` — `runAsyncCheck(..., fetcher?: typeof fetch)`; forward to
      `checkAsyncValidator(validator, name, value, fetcher)`.
- [x] `FormRenderer.tsx` — at the `runAsyncCheck(...)` call site in the resolver, pass the
      `fetcher` prop through.
- [x] `imperative.tsx` — `openFormDialog`/`openFormDrawer` forward `fetcher` (they already accept
      a `FormRendererProps` subset).
- [x] Test (`FormRenderer.fetcher.test.tsx`): a custom `fetcher` spy is invoked for (a) a remote
      `dataSource` select and (b) an `asyncValidator` check; absent prop ⇒ falls back to global
      fetch (existing async/datasource tests still pass).
- [x] Changeset: `form-renderer-web` **minor** (additive prop). `form-core` none (already supports
      `fetchImpl`).

**DoD:** `pnpm typecheck`, `pnpm --filter @org/form-renderer-web test` green, biome clean on
changed files, changeset present. Reviewer subagent before commit.

**Verify end‑to‑end:** in the test, assert the spy received the dataSource URL and the
`?value=&name=` async URL; assert default path uses global fetch when no prop is passed.

**Result the user sees:** nothing visual in the builder — it's a renderer API. Demonstrated by
the test, and by a host app that passes `fetcher={(u,o)=>fetch(u,{...o,headers:{Authorization}})}`.

Commit: `99dbacf` (branch `feat/v2-renderer-fetcher`, off `main`; reviewer PASS, no required fixes)

---

## Phase R2 — Display "Text" (read‑only display type)  ⬜
**Branch:** `feat/r2-display-text` · **Packages:** `form-schema` + `form-renderer-web` (changeset) + builder

**Why:** Real forms need static authored content (section headings, paragraphs, notes). Today
`readPretty` only renders a field's *value*; there is no value‑less display node. Closes the
"Displays" taxonomy that R1 set up in the palette.

**Design:** additive new leaf type `display-text` — holds authored content + typography level,
**no `name`, no value**. Additive per `[[form-platform-additive-schema-rule]]` ⇒ **no
`formVersion` bump** (parse‑compat test, not a migration).

> **Post‑refactor note (2026‑06‑19):** verified against the modularised source. Approach
> unchanged; structural deltas folded into the steps below. The "Displays" category already
> exists in `field-registry/queries.ts` `CATEGORY_ORDER` (no field uses it yet). The builder
> side is a **declarative registry entry** (not bespoke panel code): `new-field.ts` is fully
> data‑driven via the `named` flag, so `named:false` makes the node seed with **no name/value**
> automatically. Setting descriptors (`text`/`segmented`/`number` controls) already render the
> property panel from `settings:[]`.

**Steps**
- [ ] `form-schema/src/schema.ts` — `displayTextFieldSchema` (`type:"display-text"`, `content:
      string`, `variant?: "title"|"paragraph"|"text"`, `level?: 1..5` for titles, optional
      `align`); add to the `fieldNodeSchema` union (`schema.ts:834`); export the inferred type.
      It is a **nameless leaf** (no `name`), like the `*-pane`/`step` panes.
- [ ] `schema.test` — parses a display‑text node; an old fixture without it still parses (compat).
- [ ] `form-core` (`validation.ts`) — treat it as **value‑less**: add an explicit skip in
      `buildShape` (line ~335, before the `shape[node.name]=leafZod(...)` fallback) **and** the
      lockstep `walkLeaves`, so it never contributes a zod field or blocks submit. (It is NOT an
      `isLayoutContainer`, so without this it would wrongly be treated as a named leaf.) Add a
      core test (a form with only a display‑text + one input validates against just the input).
- [ ] `form-renderer-web` — render `Typography.Title/Paragraph/Text` from `content`/`variant`;
      **no `Form.Item` name wrapper** (it owns no value). Honour `readPretty`/design mode.
- [ ] builder `field-registry/registry.ts` — new `ComponentMeta` entry: `category:"Displays"`,
      `behavior: LEAF`, `named:false`, `defaultValueKind:"none"`, `showInPalette:true`,
      `settings:[{content textarea}, {variant segmented}, {level number}]`. No new‑field.ts edit
      (the `named:false` path handles it). No bespoke property panel — descriptors drive it.
- [ ] builder tests — `field-registry.test.ts` (parses every seeded node) + palette‑freeze test
      updated; create + parse round‑trip.
- [ ] Changeset: `form-schema` + `form-renderer-web` **minor**; builder none (private).

**DoD:** typecheck 15/15, all package + builder tests green, biome clean, changeset present,
reviewer PASS. **Verify:** drag "Text" from Displays onto the canvas → shows authored heading;
preview + submit ignore it (no value in the submitted object).

Commit: `__________`

---

## Phase R7 — Form Layout container  ⬜
**Branch:** `feat/r7-form-layout` · **Packages:** `form-schema` + `form-renderer-web` (changeset) + builder

**Why:** When a form grows, authors want a region with horizontal/vertical/inline label layout
(labelCol/wrapperCol) without changing each field. A layout‑only container is the antd‑native way.

**Design:** additive container type `form-layout` (value‑transparent, like `group` but nameless):
`children` + `layout?: "horizontal"|"vertical"|"inline"` + optional `labelCol`/`wrapperCol`/
`labelAlign`. Web renderer applies these to descendant `Form.Item`s via a React context the
controls already read for rendering; **native ignores** (single column) — never crashes.

> **Post‑refactor note (2026‑06‑19):** approach unchanged. The container **schema objects**
> still live in `schema.ts` (e.g. `groupFieldSchema` at `schema.ts:708`, union at `:834`), but
> the `isLayoutContainer` type‑guard + the `LayoutContainerField` type now live in
> **`packages/form-schema/src/containers.ts`** — update both files, not just `schema.ts`. Builder
> side is again a declarative registry entry (`named:false`, `CONTAINER` behavior).

**Steps**
- [ ] `form-schema/src/schema.ts` — `formLayoutFieldSchema` (container: `type:"form-layout"`,
      `children: z.array(fieldNodeSchema)`, `layout?`, `labelCol?`, `wrapperCol?`, `labelAlign?`,
      `visibleWhen?`/`permissions?` like other containers); add to the `fieldNodeSchema` union
      (`:834`); export type.
- [ ] `form-schema/src/containers.ts` — add `"form-layout"` to the `isLayoutContainer` guard +
      `LayoutContainerField` union so value walks treat it as transparent.
- [ ] `schema.test` + compat test (old JSON still parses).
- [ ] `form-core` — confirm `buildShape`/`walkLeaves` descend it transparently via
      `isLayoutContainer` (mirror `group`, `validation.ts:322`); add a test (children's values
      stay flat, validation descends).
- [ ] `form-renderer-web` — add a **dedicated `form-layout` branch in `renderNode` BEFORE** the
      existing generic `isLayoutContainer` fallback (`FormRenderer.tsx:489`, which only paints a
      plain transparent Row). It provides a `LayoutContext` carrying `layout`/`labelCol`; the leaf
      `Form.Item` consumes it (fallback to the form default `layoutProps`). Add a render test (a
      field inside an inline layout gets inline label props).
- [ ] builder `field-registry/registry.ts` — entry `category:"Layouts"`, `behavior: CONTAINER`,
      `named:false`, palette‑visible; `defaults` seed 1–2 children (like tabs/collapse) +
      `settings:[{layout segmented}, {labelCol number}]`.
- [ ] builder tests — `field-registry.test.ts`/palette + create round‑trip.
- [ ] Changeset: `form-schema` + `form-renderer-web` **minor**; builder none.

**DoD:** typecheck + all tests green, biome clean, changeset, reviewer PASS. **Verify:** drop a
Form Layout, set it to "inline", add two inputs → labels render inline on the canvas/preview;
saved JSON keeps children's values flat.

Commit: `__________`

---

## After R7 — bigger separate tracks (not this file)
- **i18n** (roadmap Phase P): multilingual labels + validation messages — own plan + doc.
- Then workflow‑schema/‑core, then the React‑Native renderer.

## Deferred (only on a concrete request) — rationale in `builder-ux-field-parity-v2.md`
- **T1/T2** style tokens · **R5** Transfer · **R6** Object (value‑nesting in form‑core).
