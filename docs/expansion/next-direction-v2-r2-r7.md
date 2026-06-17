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

## Phase V2 — Injectable `fetcher` in the web renderer  ⬜
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
- [ ] `FormRenderer.tsx` — add `fetcher?: typeof fetch` to `FormRendererProps`; destructure it.
- [ ] New `internal/FetcherContext.ts` — `createContext<typeof fetch | undefined>(undefined)`
      + a `useFetcher()` helper (falls back to global `fetch`).
- [ ] `FormRenderer.tsx` — wrap the form body in `<FetcherContext.Provider value={fetcher}>`
      (inside the existing `QueryClientProvider`/`ConfigProvider`).
- [ ] `controls/useRemoteOptions.ts` — read `useFetcher()`; pass it as the 3rd arg of
      `fetchDataSourceOptions(ds, depValues, fetcher)`. Add it to the react‑query `queryKey` is
      NOT needed (same url/deps), but DO keep it out of the key.
- [ ] `internal/resolver.ts` — `runAsyncCheck(..., fetcher?: typeof fetch)`; forward to
      `checkAsyncValidator(validator, name, value, fetcher)`.
- [ ] `FormRenderer.tsx` — at the `runAsyncCheck(...)` call site in the resolver, pass the
      `fetcher` prop through.
- [ ] `imperative.tsx` — `openFormDialog`/`openFormDrawer` forward `fetcher` (they already accept
      a `FormRendererProps` subset).
- [ ] Test (`FormRenderer.fetcher.test.tsx`): a custom `fetcher` spy is invoked for (a) a remote
      `dataSource` select and (b) an `asyncValidator` check; absent prop ⇒ falls back to global
      fetch (existing async/datasource tests still pass).
- [ ] Changeset: `form-renderer-web` **minor** (additive prop). `form-core` none (already supports
      `fetchImpl`).

**DoD:** `pnpm typecheck`, `pnpm --filter @org/form-renderer-web test` green, biome clean on
changed files, changeset present. Reviewer subagent before commit.

**Verify end‑to‑end:** in the test, assert the spy received the dataSource URL and the
`?value=&name=` async URL; assert default path uses global fetch when no prop is passed.

**Result the user sees:** nothing visual in the builder — it's a renderer API. Demonstrated by
the test, and by a host app that passes `fetcher={(u,o)=>fetch(u,{...o,headers:{Authorization}})}`.

Commit: `__________`

---

## Phase R2 — Display "Text" (read‑only display type)  ⬜
**Branch:** `feat/r2-display-text` · **Packages:** `form-schema` + `form-renderer-web` (changeset) + builder

**Why:** Real forms need static authored content (section headings, paragraphs, notes). Today
`readPretty` only renders a field's *value*; there is no value‑less display node. Closes the
"Displays" taxonomy that R1 set up in the palette.

**Design:** additive new leaf type `display-text` — holds authored content + typography level,
**no `name`, no value**. Additive per `[[form-platform-additive-schema-rule]]` ⇒ **no
`formVersion` bump** (parse‑compat test, not a migration).

**Steps**
- [ ] `form-schema/src/schema.ts` — `displayTextFieldSchema` (`type:"display-text"`, `content:
      string`, `variant?: "title"|"paragraph"|"text"`, `level?: 1..5` for titles, optional
      `align`); add to the leaf union + `fieldNodeSchema`; export the inferred type.
- [ ] `schema.test` — parses a display‑text node; an old fixture without it still parses (compat).
- [ ] `form-core` — treat it as **value‑less** in `buildShape`/`walkLeaves` (skip like a
      container leaf so it never contributes a zod field or blocks submit). Add a core test
      (a form with only a display‑text + one input validates against just the input).
- [ ] `form-renderer-web` — render `Typography.Title/Paragraph/Text` from `content`/`variant`;
      **no `Form.Item` name wrapper** (it owns no value). Honour `readPretty`/design mode.
- [ ] builder `field-registry` — new entry under the **Displays** category + palette chip + a
      minimal property panel (content textarea + variant/level setters via existing S1 vocab).
- [ ] builder tests — palette‑freeze/registry test updated; create + parse round‑trip.
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

**Steps**
- [ ] `form-schema/src/schema.ts` — `formLayoutFieldSchema` (container: `type:"form-layout"`,
      `children`, `layout?`, `labelCol?`, `wrapperCol?`, `labelAlign?`); add to the container
      union + `isLayoutContainer` set; export type.
- [ ] `schema.test` + compat test (old JSON still parses).
- [ ] `form-core` — confirm `isLayoutContainer` includes it so value walks descend transparently
      (mirror `group`); add a test (children's values stay flat, validation descends).
- [ ] `form-renderer-web` — a `LayoutContext` that carries the current `layout`/`labelCol`; the
      `form-layout` container provides it; `FieldControl`/`Form.Item` consume it (fallback to the
      form default). Add a render test (a field inside an inline layout gets inline label props).
- [ ] builder `field-registry` — entry under **Layouts** + palette chip (seeds 1–2 children via
      `defaults`, like tabs/collapse) + property panel (layout segmented + labelCol number).
- [ ] builder tests — registry/palette + create round‑trip.
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
