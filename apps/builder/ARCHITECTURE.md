# builder — architecture

The drag-drop form editor (Vite + antd + dnd-kit). Authors a schema tree, previews it
via `@org/form-renderer-web`, and saves through `@app/api`.

## Top-level layout (`src/`)
Every feature is a **folder with an `index.ts` barrel** (refactor R1–R5). The only files allowed at
the root of `src/` are `App.tsx` (the shell) and `main.tsx` (the entry); a new feature goes in a new
folder, never a new top-level `*.tsx` (the `feature-module` skill rule #1, enforced by
`structure.test.ts`).

| Concern | Folder / file |
|---|---|
| App shell — wiring + 3-pane layout only (logic lives in `editor/`) | `App.tsx` |
| Entry — router (`createBrowserRouter`) + `QueryClientProvider` | `main.tsx` |
| Editor state + persistence hooks + the only form/theme `fetch` | `editor/` (`useFormEditor`, `useEditorShortcuts`, `useFormPersistence`, `useNavigationGuard`, `history`, `client.ts`) |
| Design canvas + `DesignerContext` + dnd-kit drag controller | `canvas/` (`DesignCanvas`, `DesignerContext`, `useDragon`) |
| Palette of draggable field types | `palette/` |
| Preset gallery + linked-field control + `fetch` client | `presets/` |
| Workspace explorer (projects/folders), routes + `fetch` client | `workspace/` |
| react-query — `QueryClient`, `qk` key factory, test helpers | `query/` |
| Theme editor · templates gallery · workflow editor (early) | `theme/` · `templates/` · `workflow/` |
| Bespoke editors reused by the panel | `datasource/`, `reactions/` |
| Undo/redo wrapper + JSON import/export + UI pins | `lib/` (`io`, `pins`) |
| Tree engine (immutable node ops, paths, insert guard, geometry) | `engine/` |
| Outline / JSON / settings / view side panels | `workbench/` |
| **Component registry** (meta: palette/seed/settings/behavior) | `field-registry/` |
| **Property panel** (the right-hand field editor) | `PropertyPanel/` |

## Data fetching — react-query only
Server state (workspace, presets, form/theme save) goes through react-query: a feature's
`client.ts` (the **only** place `fetch` is allowed) → a `useQuery`/`useMutation` hook → the
component. Keys come from `query/keys.ts` (`qk`); mutations `invalidateQueries` rather than
re-fetching by hand. There is no `useState`+`useEffect`+`alive`-flag fetching and no manual
`reload()` left in the tree (refactor R4/R5). `fetch(` appears only in `editor/client.ts`,
`workspace/client.ts`, and `presets/client.ts`.

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
| `rules.ts` | pure JSONLogic readers: `readEqualsRule`, `readSimpleRule`, `CROSS_OPS`, `coerceLiteral` |
| `helpers.ts` | `nodeName`/`nodeLabel`/`csv`/`parseCsv`/`prop`/`mergePermissions` |
| `types.ts` | `AuthoredField`, `SelectedNode`, `Patch`, `ColKey`/`COL_KEYS` |

## Conventions
- Relative imports here use **no `.js` extension** (bundler resolution). A folder import
  like `../PropertyPanel` resolves to that folder's `index.ts`.
- A change at drill-depth is rebuilt into one patch on the top-level node via
  `patchNodeAtPath`, so `App`'s `onChange` stays a single-node swap.
