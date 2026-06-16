# Track V — Renderer portability (antd v6 support + injectable fetcher)

> Planning doc (written 2026‑06‑16). Driven by the owner's question: "can I consume this
> form in another app using Next.js 16 / React 19 / antd v6 / tailwind / zustand /
> react‑query / axios?". Short answer: **yes** — the architecture is built for it
> (react/react‑dom/antd are peerDependencies, the schema is the contract). Two concrete
> gaps stand between "works on antd 5" and "drops cleanly into that stack".

---

## Compatibility verdict (per the survey, 2026‑06‑16)

`@org/form-renderer-web` peerDeps today: `antd ^5`, `@ant-design/icons ^5`,
`@tanstack/react-query ^5`, `react ^18||^19`, `react-dom ^18||^19`.

| Target stack item | Status | Note |
| --- | --- | --- |
| React 19 | ✅ already declared | peerDep `^18||^19`. |
| @tanstack/react-query v5 | ✅ required & matches | renderer fetches remote `dataSource` via react‑query; app must provide a `QueryClientProvider`. |
| zustand | ✅ orthogonal | renderer uses react‑hook‑form internally; app state is independent. |
| axios | ✅ no conflict | renderer fetches via `fetch`; see **V2** to route dataSource through the app's client. |
| tailwindcss | ✅ coexists | standard caveat: Tailwind preflight reset vs antd styles. |
| Next.js 16 (App Router) | ✅ with setup | client‑component boundary + antd SSR registry (`@ant-design/nextjs-registry`). Package is ESM‑only. |
| **antd v6** | ⚠️ **needs V1** | peerDep capped at `^5`; renderer built/tested on antd 5. |

**Good news from the code audit:** the renderer already uses the *modern, non‑deprecated*
antd surface that v6 keeps — so the port is expected to be **small and low‑risk**:
- `variant={…}` on Input / InputNumber / Password / Select / DatePicker / RangePicker
  (NOT the removed `bordered`).
- `items={…}` for `Tabs`, `Collapse`, `Steps` (NOT the removed `TabPane` / `Collapse.Panel`).
- `open={…}` + `afterClose`/`afterOpenChange` on `Modal` / `Drawer` (NOT `visible`).
- No `tipFormatter`, `dropdownMatchSelectWidth`, `dropdownRender`, `bordered`, `bodyStyle`,
  or static `Modal.`/`message.`/`notification.` calls anywhere in renderer `src`.
- `Card` uses `size`/`extra`/`title`/`style` only (no `bordered`/`bodyStyle`).
- `ConfigProvider theme={ThemeConfig}` is token‑based; the theme object is supplied by the
  app (and the builder), so token renames are an app/builder concern, not a renderer‑code one.

---

## V1 — antd v6 support

| Step | Detail |
| --- | --- |
| Peer range | `antd: "^5.0.0 || ^6.0.0"`, `@ant-design/icons: "^5.0.0 || ^6.0.0"` (icons version together with antd). |
| Dev deps | add antd 6 + icons 6 to `form-renderer-web` devDeps; build + run the renderer test suite on v6. |
| Type fixes | antd 6 ships its own types; fix any tightened prop types surfaced by `tsc`. Expected: few/none, given the audit. |
| Theme tokens | verify the `ThemeConfig` tokens the **builder** authors still exist in v6 (token renames); adjust the builder's `DEFAULT_TOKENS` / theme setters if needed. This is the most likely real change. |
| Icon glyphs | the curated `antd:` namespace in `defaultIcons.ts` uses named glyph imports stable across v5/v6; confirm none were renamed. |
| Changeset | `form-renderer-web` minor (peer widening). |

Risk: **Low.** The unknowns are (a) antd‑6 design‑token renames hitting the builder theme,
and (b) any jsdom/test‑env behaviour change — both bounded and caught by the test suite.

## V2 — Injectable dataSource fetcher (auth headers / axios / baseURL)

Today remote `dataSource` options are fetched with the global `fetch` and **no way to add
auth headers, a baseURL, or route through the app's axios client**. The core already supports
it: `fetchDataSourceOptions(ds, values, fetchImpl = fetch)` takes an optional `fetchImpl`
([`form-core/src/datasource.ts`]). The gap is purely in the wiring:

| Step | Detail |
| --- | --- |
| Renderer prop | add an optional `fetcher?: typeof fetch` (or a small `{ fetch, baseURL?, headers? }`) to `FormRenderer` props; default to global `fetch` (no behaviour change). |
| Thread it | `FormRenderer` → context → `useRemoteOptions` → pass as `fetchImpl` into `fetchDataSourceOptions`. |
| Imperative | forward the same option through `openFormDialog`/`openFormDrawer`. |
| Tests | a unit test asserting the injected fetcher is used (mock) + default unchanged. |
| Scope | builder‑internal default stays `fetch`; consuming apps pass an axios‑backed `fetchImpl`. |
| Changeset | `form-renderer-web` minor (additive prop). Core needs none (already supports it). |

Risk: **Very low** — additive optional prop; core is ready.

---

## Distribution prerequisite (not code)

The three packages are `version 0.1.0` and linked via `workspace:*` — **not published**.
To consume them in an external repo, publish `@org/form-schema`, `@org/form-core`,
`@org/form-renderer-web` to npm / a private registry (Changesets is already set up).
`form-schema` + `form-core` are framework‑agnostic TS (zod + json‑logic) — usable in Node /
native / any FE. Only `form-renderer-web` carries the antd/React peer surface.

---

## Recommended order
V2 first (tiny, additive, unblocks real‑app auth), then V1 (when an antd‑6 target actually
lands). Both are independent of Track W and can ship anytime.

*Related: `workspace-projects.md` (Track W), `builder-ux-field-parity-v2.md`.*
