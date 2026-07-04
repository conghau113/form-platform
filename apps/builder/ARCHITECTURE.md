# builder — architecture

> **Freshness contract** — descriptive (L2), registered in
> [`knowledge/index.yaml`](../../knowledge/index.yaml) as `builder-architecture`. **Class:** E1 ·
> **Verified-on:** 2026-07-03 (framework T0.2.2) · **Cadence:** re-verify when a builder feature
> folder is added / removed or the fetch-only-in-`apiFetch.ts` convention changes; else each release.
> **Scope:** `apps/builder/src/**`. The executable re-verify method (documented feature folders all
> present · `fetch(` confined to the sole file `lib/apiFetch.ts`) lives in the index entry.
> Drift = defect: file it, do not silently patch (constitution §10).

The drag-drop form editor (Vite + antd + dnd-kit). Authors a schema tree, previews it
via `@org/form-renderer-web`, and saves through `@app/api`. The whole SPA sits behind auth
(`RequireAuth` → `/login`) inside an adaptive app shell (persistent nav rail + routed section).

## Top-level layout (`src/`)
Every feature is a **folder with an `index.ts` barrel** (refactor R1–R5). The only files allowed at
the root of `src/` are `App.tsx` (the editor 3-pane) and `main.tsx` (the entry); a new feature goes
in a new folder, never a new top-level `*.tsx` (the `feature-module` skill rule #1, enforced by
`structure.test.ts`).

| Concern | Folder / file |
|---|---|
| Editor 3-pane (canvas + property panel + workbench + AI drawer + publish); rendered by `workspace/EditorRoute` | `App.tsx` |
| Entry — antd `ConfigProvider`(locale vi) + `App` context · `QueryClientProvider` · `AuthProvider` · data router (`createBrowserRouter`, for `useBlocker`) | `main.tsx` |
| Auth — `LoginPage`, `AuthProvider`/`useAuth`, `RequireAuth` route guard, function-gated nav (`functions.ts`), `UserMenu`; `client.ts` = login/register/logout | `auth/` |
| Adaptive app shell — persistent nav rail + routed section (layout route) | `shell/` (`AppShell`, `NavRail`, `nav.ts`, `SettingsPage`) |
| Admin console — data-driven RBAC roles + users panels | `admin/` (`AdminPage`, `RolesPanel`, `UsersPanel`, `useAdmin`) |
| Editor state + persistence hooks (form/theme save) | `editor/` (`useFormEditor`, `useEditorShortcuts`, `useFormPersistence`, `useNavigationGuard`, `history`, `client.ts`) |
| Design canvas + `DesignerContext` + dnd-kit drag controller | `canvas/` (`DesignCanvas`, `DesignerContext`, `useDragon`) |
| Palette of draggable field types | `palette/` |
| Preset gallery + linked-field control (+ AI preset modal) | `presets/` (+ `presets/ai/`) |
| Workspace explorer (projects/folders) + routes | `workspace/` (`ProjectsPage`, `ProjectWorkspace`, `EditorRoute`, `client.ts`) |
| Form submissions — submit + list + detail (field-level RBAC "acting as") | `submissions/` (`SubmissionsRoute`, `form-roles`, `useSubmissions`) |
| Form versions — publish + version history + field-level diff | `versions/` (`VersionsRoute`, `PublishControl`, `diff`, `useVersions`) |
| AI assistant — generate/refine a form (BYOK credentials) | `ai/` (`AiAssistantDrawer`, `creds`, `diff`, `useGenerateForm`) |
| Workflow editor (xyflow) + AI drawer + status catalog | `workflow/` (+ `workflow/ai/`, `workflow/status-catalog/`) |
| react-query — `QueryClient`, `qk` key factory, test helpers | `query/` |
| Theme editor · templates gallery | `theme/` · `templates/` |
| Bespoke editors reused by the panel | `datasource/`, `reactions/` |
| Central `apiFetch` (401 → refresh → retry) + undo/redo wrapper + JSON import/export + UI pins | `lib/` (`apiFetch`, `io`, `pins`) |
| Tree engine (immutable node ops, paths, insert guard, geometry) | `engine/` |
| Outline / JSON / settings / view side panels | `workbench/` |
| **Component registry** (meta: palette/seed/settings/behavior) | `field-registry/` |
| **Property panel** (the right-hand field editor) | `PropertyPanel/` |

## Data fetching — react-query over a shared `apiFetch`
Server state (workspace, presets, forms/themes, workflows, submissions, versions, admin/RBAC, AI)
goes through react-query: a feature's `client.ts` → a `useQuery`/`useMutation` hook → the component.
Keys come from `query/keys.ts` (`qk`); mutations `invalidateQueries` rather than re-fetching by hand.
No `useState`+`useEffect`+`alive`-flag fetching, no manual `reload()` (refactor R4/R5).

Every feature `client.ts` calls **`apiFetch`** (`lib/apiFetch.ts`), the shared wrapper — not raw
`fetch`. `apiFetch` keeps a session alive across access-token expiry (production-hardening A1): on a
`401` it fires a **single de-duplicated** `POST /auth/refresh` (concurrent 401s share one in-flight
refresh, so token rotation never sees a replay), then transparently retries the original request. If
the refresh fails the session is over — it surfaces the original 401 and notifies the auth layer via
`setSessionExpiredHandler`, dropping the app to the login screen.

> **The only raw `fetch(` in the tree** is inside `lib/apiFetch.ts` itself and `auth/client.ts`
> (login/register/logout — the cookie-setting endpoints that must bypass the refresh-retry, listed
> in `apiFetch`'s `AUTH_BYPASS`). The invariant is now: **feature I/O flows through `apiFetch` via
> each `client.ts`; raw `fetch` lives only in `apiFetch` + the auth entry points** — the update of
> the old "`fetch` only in `client.ts`" rule.

## `field-registry/` — the meta-driven registry
Single source of truth the builder derives palette, model factories, property panel,
and the tree insert-guard from (Formily/Designable-style behavior flags on top of the
Zod contract). Import via `../field-registry` (resolves to `index.ts`).
| File | Holds |
|---|---|
| `types.ts` | `FieldType`, `NodeType`, `SettingDescriptor`, `ComponentBehavior`, `ComponentMeta`, … |
| `descriptors.ts` | reusable setting descriptors, `LEAF`/`CONTAINER` behaviors, `STRING_RULES`/`NUMBER_RULES`, `FORM_SETTINGS` |
| `registry.ts` | the big `FIELD_REGISTRY` array + `FORM_META` + `BY_TYPE` lookup |
| `queries.ts` | `describeNode/describeField`, `FIELD_TYPES`, `PALETTE_TYPES`, `fieldTypeLabel`, `paletteEntries`, `canInsert`, `metaGuard` |
| `new-field.ts` | `newField` factory + `seedName` |
| `index.ts` | barrel (public surface — unchanged from the old single file) |
**Adding a field type = one `FIELD_REGISTRY` entry** (+ schema + renderer). No edits to
the property panel or palette.

## `PropertyPanel/` — the field editor
Import via `../PropertyPanel` (resolves to `index.ts`). Public surface: `PropertyPanel`,
`SelectedNode`, `OptionsEditor`, `Option`, `readEqualsRule`, `readSimpleRule`, `CROSS_OPS`.
| File | Holds |
|---|---|
| `PropertyPanel.tsx` | shell: selection/drill state, breadcrumb, container-vs-field branch |
| `FieldForm.tsx` | the full per-field editor (label/name/pattern/validation/visibility/reactions/permissions) |
| `TypeSettings.tsx` | `TypeSettings` + descriptor-driven `SettingControls` |
| `FormSettingsEditor.tsx` | root Form settings (id/title/layoutProps/validateTrigger) |
| `DefaultValueEditor.tsx` | default-value control per `defaultValueKind` |
| `ValidationEditor.tsx` | rule list + remote check + `CrossRuleControls` + rule labels/severity/format consts |
| `ItemFieldsEditor.tsx` | array `itemFields` editor (columns + variant) |
| `StepsEditor.tsx` | wizard step list (writes via the tree, not `set`) |
| `OptionsEditor.tsx` | static `{label,value}` list editor (also imported by DataSourceEditor/ReactionsEditor) |
| `KeyValueEditor.tsx` | controlled ordered `{ key, value }` pair list editor |
| `JsonEditor.tsx` | pretty-printed JSON control for a raw model value |
| `PresetLink.tsx` | field-level "linked preset" control (Track W4: link/override/unlink) |
| `TranslationsEditor.tsx` | node's per-attribute, per-locale `i18n` overrides editor |
| `TranslatePopover.tsx` | compact 🌐 popover editing one string's per-locale translations |
| `translatable.ts` | the translatable string attributes a node can carry (display order + labels) |
| `sections.ts` | `PANEL_SECTIONS` — section identity + search keywords (G3 panel search) |
| `rules.ts` | pure JSONLogic readers: `readEqualsRule`, `readSimpleRule`, `CROSS_OPS`, `coerceLiteral` |
| `helpers.ts` | `nodeName`/`nodeLabel`/`csv`/`parseCsv`/`prop`/`mergePermissions` |
| `types.ts` | `AuthoredField`, `SelectedNode`, `Patch`, `ColKey`/`COL_KEYS` |

## Conventions
- Relative imports here use **no `.js` extension** (bundler resolution). A folder import
  like `../PropertyPanel` resolves to that folder's `index.ts`.
- A change at drill-depth is rebuilt into one patch on the top-level node via
  `patchNodeAtPath`, so `App`'s `onChange` stays a single-node swap.
