# builder — architecture

The drag-drop form editor (Vite + antd + dnd-kit). Authors a schema tree, previews it
via `@org/form-renderer-web`, and saves through `@app/api`.

## Top-level layout (`src/`)
| Concern | File / folder |
|---|---|
| App shell, selection state, save/load wiring | `App.tsx` |
| Palette of draggable field types | `Palette.tsx` |
| Design canvas (renders the form in designMode) | `DesignCanvas.tsx` |
| dnd-kit drag controller | `useDragon.ts` |
| Undo/redo + JSON import/export | `history.ts`, `io.ts` |
| Form templates gallery | `templates.ts`, `TemplateGallery.tsx` |
| Theme editor | `ThemeEditor.tsx` |
| Workflow editor (early) | `WorkflowEditor.tsx`, `workflow-model.ts` |
| Tree engine (immutable node ops, paths, insert guard) | `engine/` |
| Outline / JSON / settings / view side panels | `workbench/` |
| Bespoke editors reused by the panel | `DataSourceEditor.tsx`, `ReactionsEditor.tsx`, `TreeOptionsEditor.tsx` |
| **Component registry** (meta: palette/seed/settings/behavior) | `field-registry/` |
| **Property panel** (the right-hand field editor) | `PropertyPanel/` |

## `field-registry/` — the meta-driven registry
Single source of truth the builder derives palette, model factories, property panel,
and the tree insert-guard from (Formily/Designable-style behavior flags on top of the
Zod contract). Import via `../field-registry` (resolves to `index.ts`).
| File | Holds |
|---|---|
| `types.ts` | `FieldType`, `NodeType`, `SettingDescriptor`, `ComponentBehavior`, `ComponentMeta`, … |
| `descriptors.ts` | reusable setting descriptors, `LEAF`/`CONTAINER` behaviors, `STRING_RULES`/`NUMBER_RULES`, `FORM_SETTINGS` |
| `registry.ts` | the big `FIELD_REGISTRY` array + `FORM_META` + `BY_TYPE` lookup |
| `queries.ts` | `describeNode/describeField`, `FIELD_TYPES`, `PALETTE_TYPES`, `fieldTypeLabel`, `fieldsByCategory`, `canInsert`, `metaGuard` |
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
