# EXPANSION — Formily/Designable-parity roadmap for the form builder

This is the **second** runbook, layered on top of [EXECUTION.md](EXECUTION.md).
EXECUTION.md built the platform (Phases 0–11). EXPANSION.md grows the form builder
toward [Formily](https://github.com/alibaba/formily) /
[Designable](https://designable-antd.formilyjs.org/) feature parity.

Conventions live in [AGENTS.md](AGENTS.md) — never restate them in a prompt. Run the
**Closing Loop** (EXECUTION.md) after every phase: self-verify `pnpm typecheck` +
`pnpm test` until green → `reviewer` subagent → `pnpm changeset` → commit → `/clear`.

## Direction (decided 2026-06-10)

- Order: **A → G** (safe, additive, value-increasing).
- Depth: **Full Formily-style** — adopt Formily's _patterns_ (component registry,
  reactions/effects, meta-driven setting panel, outline tree) **on top of the existing
  Zod contract**. Do NOT replace the contract with Formily's JSON-Schema (`x-component`
  etc.) — the Zod discriminated union in `packages/form-schema` stays the source of truth.
- 2026-06-11: **goal upgraded to Designable-parity editor UX** (the user wants the
  builder to behave 1:1 like https://designable-antd.formilyjs.org/). We REBUILD
  Designable's interaction model natively rather than vendoring `@designable/*`
  (unmaintained since ~2022, antd v4, MobX engine, couples the tree to Formily
  JSON-Schema). Reference architecture studied from alibaba/designable:
  `packages/core` models — `TreeNode`, `Operation`, `Selection`, `Hover`, `History`,
  `MoveHelper` (closest-direction insertion), `Shortcut`, `Screen/Viewport` — plus
  `formily/antd` component behaviors (`createBehavior`/`createResource`: `droppable`,
  `propsSchema`, `defaultProps`, root Form gets labelCol/wrapperCol/layout/size…) and
  the playground workbench (CompositePanel | Toolbar + ViewPanel×4 | SettingsForm).

## Non-negotiables (same as AGENTS.md, restated for this track)

- Schema IS the contract. Renderers consume it. Adding **optional** types/props is
  additive → old JSON still parses → **no `CURRENT_FORM_VERSION` bump** (precedent: how
  `textarea` and Phase A's 7 types were added). Bump + migration N→N+1 + a fixture test
  ONLY when an existing field's shape changes in a breaking way.
- Conditional/linkage logic uses JSONLogic via form-core. NEVER `eval()` / `new Function()`.
- `react`/`react-dom`/`antd`/`react-native` stay peerDependencies in renderers.

---

## Phase A — Expand basic field types ✅ DONE (2026-06-10)

Added 7 leaf types (`radio`, `switch`, `slider`, `rate`, `password`, `time`, `color`) and
3 optional common props (`tooltip`, `disabled`, `defaultValue`) across schema → core →
renderer-web → builder. Introduced the **meta-driven field registry**
`apps/builder/src/field-registry.ts`: each type declares category + default factory +
type-specific setting descriptors; Palette, `model.newField` and PropertyPanel are now
generated from it instead of hard-coded switches. Guard test:
`apps/builder/src/field-registry.test.ts` parses every seeded field against the contract.
Changeset: `.changeset/expanded-field-types.md`.

## Phase B — Full validation rules ✅ DONE (2026-06-10)

Scope: `packages/form-schema` + `packages/form-core` + `apps/builder`.
Added an optional `validations[]` to every leaf field (via `commonFields`) — `{ type:
"required" | "len" | "min" | "max" | "pattern" | "format", value?, format?:
"email"|"url"|"phone", message? }` — defined as `validationRuleSchema` in `form-schema`.
Additive → old JSON parses → no `CURRENT_FORM_VERSION` bump. form-core's `buildZodSchema`
compiles each rule: string fields honor len/min/max/pattern/format, numeric fields honor
min/max, a `required` rule == the `required` flag; patterns use `new RegExp` in a guarded
try/catch (malformed → skipped, never eval), and optional string fields treat an empty
value as absent. The builder's PropertyPanel gained a descriptor-driven "Validation"
section: each `FieldDescriptor` declares its allowed rule kinds (`STRING_RULES` /
`NUMBER_RULES` in `field-registry.ts`). Tests in `form-core/src/validation.test.ts` cover
every rule kind, custom messages, url/phone, the malformed-pattern guard and hidden-field
skipping. Changeset: `.changeset/field-validation-rules.md`.

## Phase C — Array fields / Form List ✅ DONE (2026-06-10)

Added the `array` node — recursive like `group`, holding `itemFields: FieldNode[]` +
optional `required`/`minItems`/`maxItems` — as `arrayFieldSchema` in `form-schema`
(additive → no `CURRENT_FORM_VERSION` bump; `migrate`'s walk now recurses `itemFields`).
form-core refactored its `buildZodSchema` walk into a reusable `buildShape` and compiles
an array into a Zod array of row objects (item schema + min/max + required-as-minItems);
item fields validate as always-visible (per-row `visibleWhen` is a known limitation,
deferred to Phase F). renderer-web renders a Form List of antd cards via `useFieldArray`
with add/remove/reorder; a name-prefix threaded through `renderNode` binds row controls to
`name.{index}.{child}`, so values become `name: [{...}, ...]`. builder: the flat model
widened to `AuthoredField = LeafField | ArrayField`, an "Array (list)" palette entry, and a
compact non-DnD `ItemFieldsEditor` in PropertyPanel (type/label/name/required + reorder).
Tests across schema/core/renderer/builder; changeset `.changeset/array-form-list.md`.

**Phase C+ (2026-06-10):** brought the Form List to antd parity. Added optional
`array.variant: "card" | "table"` (additive, no version bump) — renderer-web renders the
table variant as an antd `Table` (one column per item field; `renderNode` gained
`hideLabel`/`bare` opts for label-less full-width cells). The builder PropertyPanel is now
**recursive with a drill path**: a "Configure" button on an item field opens the FULL
property editor for it (options/validation/default/layout/visibility), with a breadcrumb to
return; a "Display: Cards / Table" toggle sets the variant. New pure helpers
`apps/builder/src/node-path.ts` (`nodeAtPath`/`patchNodeAtPath`) rebuild one top-level patch
from a nested edit, so App's editor↔schema boundary is unchanged. Changeset
`.changeset/array-table-and-item-config.md`. Drag-based nested authoring on the canvas
(outline tree) still belongs to Phase D.

## Phase D — Designer engine & tree foundation ✅ DONE (2026-06-11)

Rebuild the relevant parts of `@designable/core` as pure, tested TS (no UI yet), and
teach the contract the container/layout vocabulary Designable has. Heaviest refactor;
each step lands in its own commit with `pnpm typecheck` + `pnpm test` green.

**Approved plan (2026-06-11):** full step-by-step plan lives at
`C:\Users\ASUS\.claude\plans\synthetic-wibbling-rabin.md` — read it before resuming.
User-confirmed decisions: (a) **pane-as-node** — `tab-pane`/`collapse-panel` are union
members (uniform tree recursion; tabs/collapse children structurally restricted to
panes); (b) **containers stay OUT of the palette until Phase E** (`showInPalette:
false` in D6) — Phase D's user-visible win is lossless load/save of container JSON +
containers render in Preview. Step order: D1→D8 with an added **D7b** (builder
integration) because the App swap needs D6 metas + D7 transformer.

- [x] **D1 — schema (containers)** ✅ commit `238ecc0`. 7 union types: `tabs`,
      `tab-pane`, `collapse`, `collapse-panel`, `card`, `grid` (cols 1–24, default 2),
      `space` — manual interfaces + z.lazy like group; containers are NAMELESS and
      value-transparent. New `packages/form-schema/src/containers.ts`:
      `isLayoutContainer` / `childrenOf` / `childrenKeyOf` (single source for walks).
      form-core `buildShape` hoists via `isLayoutContainer` (pulled forward from D3 to
      keep the commit green); renderer got a transparent pass-through (upgraded in D3);
      PropertyPanel got nameless-tolerant `nodeName`/`nodeLabel` accessors. Fixture
      `examples/form.v3.json` (container-inside-array + array-inside-tab). No version
      bump — CURRENT_FORM_VERSION stays 3.
- [x] **D2 — schema (form-level layout)** ✅ commit `6b5dd3e`. `formLayoutPropsSchema`
      (layout/labelCol/wrapperCol/size/colon/labelAlign/labelWrap) optional on root;
      `decoratorPropsSchema` optional on every leaf via `commonFields`.
- [x] **D3 — form-core + renderer-web consume D1/D2** ✅ commit `146df8e`.
      renderer-web renders real antd `Tabs`/`Collapse` (**forceRender: true is
      load-bearing** — without it RHF Controllers in unvisited panes never register),
      `Card`, `Grid` (Row+Col, cell = 24/cols, field colSpan wins), `Space` (bare
      children); hidden panes filtered via isVisible/canView; `layoutProps` applied on
      antd `Form`, `decoratorProps` spread onto `Form.Item`. Also an a11y fix the tests
      rely on: `Form.Item htmlFor` + control `id` = RHF fieldName (ColorPicker has no
      id prop — skipped). renderNode opts now `{hideLabel, bare, span}`. Tests:
      `FormRenderer.containers.test.tsx` (8) + 6 container tests in form-core.
- [x] **D4 — designer tree model** ✅ commit `299865c` (`apps/builder/src/engine/`): `tree.ts` —
      `TreeNode { uid, node: EngineProps, children }` where `EngineProps = FormProps
    (type:"form", id/title/layoutProps/settings) | FieldProps (FieldNode minus
    children/itemFields)`. Pure path-copying ops: `append`, `insertBefore/After`,
      `remove`, `move(before|after|append)`, `patchNode`, `clone` (fresh uids +
      `uniqueName`); queries `findNode/findParent/ancestorsOf/contains/collectNames`.
      Invalid op ⇒ SAME root reference; caller-injected `InsertGuard` (D6 will pass
      the meta guard); engine invariants: no second root, root unmovable/undeletable,
      cycle guard. `uid.ts` (makeUid moved here; model.ts re-exports until D7b),
      `names.ts` (uniqueName: "text1"→"text2"). 11 tests in `engine/tree.test.ts`.
      NO UI changes yet — App/Canvas/PropertyPanel still run on the flat EditorModel.
- [x] **D5 — operation state** ✅ commit `bbe82d6`. Pure modules in
      `apps/builder/src/engine/`: `selection.ts` (SelectionState {selected:
      string[]} + select/toggle/selectMany/clearSelection/isSelected/
      pruneSelection — same-reference no-ops), `hover.ts` (trivial HoverState
      for the Phase E drag engine), `clipboard.ts` (copyNodes = top-most-only
      deep snapshot preserving uids/names; pasteAfter/pasteInto via engine
      `clone` ⇒ fresh uids + names unique to the destination), `engine/history.ts`
      (pure value-generic timeline as entries+cursor: createHistory/present/
      pushHistory/resetHistory/undoHistory/redoHistory/jumpTo/historyEntries +
      canUndo/canRedo). `src/history.ts` `useHistory` now DELEGATES to the pure
      module — public API preserved (App.tsx untouched, existing
      `src/history.test.ts` passes UNMODIFIED), additive `set(next, label?)` +
      `entries`/`jumpTo`. Tests: engine/history|selection|clipboard.test.ts (16).
      App-only change → no changeset (builder is in the changeset ignore list).
- [x] **D6 — ComponentMeta registry v2** ✅ commit `2aba7a5`. Extended
      `field-registry.ts` in place (every existing export kept). `FieldType =
    FieldNode["type"]` (widened), `NodeType = FieldType | "form"`. `ComponentBehavior
    { droppable, draggable, cloneable, deletable, allowAppend?, allowParents? }` +
      `ComponentMeta { behavior, icon?, showInPalette, named }` on every entry. New
      nameless container metas (group/tabs/tab-pane/collapse/collapse-panel/card/grid/
      space) + separate `FORM_META` root (droppable-only, `FORM_SETTINGS` = D2
      layoutProps select/checkbox descriptors for F4). ALL containers
      `showInPalette:false` → palette frozen; `PALETTE_TYPES` is the exact authorable
      list, `fieldsByCategory`/`ITEM_TYPES`/`paletteType` filter on it. `canInsert(parent,
    child)` central guard (form never inserted; parent droppable; tabs⇒tab-pane &
      collapse⇒collapse-panel via `allowAppend`; panes pinned via `allowParents`) +
      `metaGuard(): InsertGuard` for engine ops. `describeNode(NodeType)` covers form;
      `describeField(FieldType)` unchanged. `SettingDescriptor` gained `control:"select"` + `choices`; PropertyPanel `TypeSettings` renders it. `model.ts` `newField` is now
      named-aware (skips `name` for nameless containers, seeds `children:[]`) and returns
      `FieldNode`. NOTE: form lives in `FORM_META` (not the FIELD_REGISTRY array) so
      FIELD_TYPES/PALETTE_TYPES stay FieldType[]. Tests: canInsert matrix, metaGuard,
      form-meta flags, palette-freeze, named/nameless seeding. Builder-only → no
      changeset (deferred to D8).
- [x] **D7 — transformer** ✅ commit `fa28348`. `engine/transform.ts` —
      `schemaToTree`/`fieldToTree` (strip children via `childrenKeyOf`, fresh uids),
      `treeToField`/`treeToSchema` (array ALWAYS emits `itemFields` even []; omit
      undefined optionals; at `CURRENT_FORM_VERSION`), `replaceField(root, uid, field)`
      (keeps target uid — the PropertyPanel boundary; exported `replaceAt` from `tree.ts`
      to path-copy). Transformer NEVER renames. Tests: round-trip identity for migrated
      form.v1.json + form.v3.json, every container type incl. empty children, layoutProps/
      decoratorProps/settings, fresh-uid uniqueness, replaceField uid semantics + sibling
      `===` sharing (11).
- [x] **D7b — builder integration** ✅ commit `7d7d86b`. App.tsx runs on
      `useHistory<TreeNode>(schemaToTree(migrate(example)))`, `schema = treeToSchema(tree)`;
      onDragEnd → `fieldToTree(newField(...))` + `append`/`insertBefore` + `metaGuard()`,
      reorder via `move` (matches dnd-kit arrayMove), delete gated on `behavior.deletable`;
      selection = `SelectionState` (single-select preserved) pruned after every tree change;
      panel selection = `findNode` + `treeToField`, onChange → `replaceField`, title/id →
      `patchNode` on root. Canvas renders root's `TreeNode[]` (title fallback
      label??title??name??type). PropertyPanel `selected` widened to `{ uid, field:
    FieldNode }`; layout containers get a minimal settings-only editor, leaves/array keep
      the full editor; `siblings` → `siblingNames: string[]`. `node-path.ts` →
      `engine/field-path.ts` walking `childrenOf` (fixes the latent no-op patch bug for a
      leaf nested under a container inside `itemFields`). DELETED `model.ts` +
      `model.test.ts`; `newField`/`seedName` now live in `field-registry.ts`. Flat canvas
      UX unchanged. Tests: `engine/integration.test.ts` (load→reorder→nested patch→save on
      v3, containers survive) + field-path container drilling. NOTE: `replaceField`
      regenerates descendant uids — fine in D (only top-level selectable), Phase E must
      switch the settings panel to `patchNode`-style edits.
- [x] **D8 — close** ✅. reviewer subagent (no required fixes; flagged that a selectable
      `group` will need a name editor in Phase E — see Phase E note), changeset
      `.changeset/designer-containers-layout.md` (minor: form-schema, form-core,
      form-renderer-web — covers D1–D3; builder is in the changeset ignore list), Phase D
      marked ✅, memory updated.

## Phase E — WYSIWYG canvas + Designable-grade drag & drop ✅ DONE (2026-06-11)

The canvas stopped being a row list and now renders **real antd components**, with
Designable's pointer-driven drag engine and aux widgets — this is what makes it _feel_
like designable-antd.formilyjs.org.

**Approved plan (2026-06-11):** `C:\Users\ASUS\.claude\plans\curious-dazzling-diffie.md`.
Key decisions: (a) the rendered-node→uid bridge is a **positional path** (not object
identity — `FormRenderer` deep-clones via `migrate()`, so a WeakMap would miss); (b) array
item-field authoring stays in the **PropertyPanel** (on-canvas drag-into-array deferred);
(c) the D8 review follow-ups (container settings via `patchNode`, group name editor) land
in E4.

- [x] **E1 — design-mode rendering** ✅ commit `01b0f2d` (renderer-web, **changeset**
      `renderer-design-mode.md`). Additive `nodeWrapper(rendered, { node, path })` +
      `designMode` props on `FormRenderer`; leaf controls wrapped pointer-inert (NOT
      `disabled`) only in design mode; Submit hidden. `path` threaded through
      `renderNode`/`renderChildren`; tab/collapse panes carry their ORIGINAL index for
      the path while keeping the filtered position as antd's pane key, so a hidden pane
      never shifts a sibling's path and the runtime DOM is byte-for-byte unchanged.
      Tests: `FormRenderer.designMode.test.tsx`.
- [x] **E2 — drag engine core ("Dragon")** ✅ commit `969f5f0`. Pure
      `engine/move-helper.ts` (`dropIntent`: leaf splits before/after at the parent-axis
      midline; droppable container reads before/after in an edge band, INNER in the
      middle) + `engine/dragon.ts` (`axisOf`, `canDrop` mirroring the tree-op guards,
      `intentToMoveTarget`, `performDrop` committing ONE create/move op, multi-move order
      preserved via an advancing anchor). Tests: move-helper (5) + dragon (10).
- [x] **E3 — WYSIWYG canvas + aux widgets + the swap** ✅ commit `7de9f9e`. `useDragon.ts`
      = DOM seam (pointerdown→track→`elementFromPoint`→`closest([data-designer-node-id])`
      →MoveHelper→`canDrop`→`performDrop` on up; press<4px = click→select; Esc/
      pointercancel/unmount tear down). `DesignCanvas.tsx` = DesignerContext + `NodeShell`
      (hover outline+name tag, selection box + floating toolbar drag/copy/delete, insertion
      line, empty-container "+", legend) + drag ghost; form element memoised so hover/
      selection (via context) don't rebuild it; `buildPathIndex` maps path→uid. `Palette`
      drives `beginCreate`; `App` dropped `DndContext`/`onDragEnd`; containers selectable;
      `Canvas.tsx` deleted. Tests: `DesignCanvas.test.tsx`.
- [x] **E4 — shortcuts, multi-select, clipboard + D8 fixes** ✅ commit `4c10d36`.
      ctrl/⌘+click toggle, ctrl/⌘+A (top-level), ctrl/⌘+C/V via `engine/clipboard`
      (fresh uids + unique names), Delete/Backspace — all through D5 state. Multi-select
      drag moves the whole selection (filtered to top-most via new `tree.topMostUids`); a
      non-drag click still selects the pressed node (`useDragon` `clickUid`). **D8 fixes:**
      `transform.applyFieldEdit` patches a layout container's OWN props via `patchNode`
      (descendant uids/selection survive) while leaves/array still `replaceField`;
      PropertyPanel gained a Name editor for named containers (`group`). Tests:
      applyFieldEdit + topMostUids.
- [x] **E5 — cleanup + close** ✅. Dropped the unused `@dnd-kit/*` deps from
      `apps/builder` (nothing imports them; WorkflowEditor uses `@xyflow/react`). Smoke
      tests green; biome clean (27 baseline warnings); reviewer ran each step. Builder is
      changeset-ignored, so E1's renderer-web changeset is the only published surface.

## Phase F — Workbench shell (panel parity with the Designable playground)

Layout: CompositePanel (left) | Toolbar + Viewport (center) | SettingsPanel (right).
**COMPLETE (F1–F5 committed on `feat/phase-f-workbench`).** All new chrome lives in
`apps/builder/src/workbench/`; builder is changeset-ignored, so no changeset.

- [x] **F1 — CompositePanel** (`add17f7`) with FOUR tabs: **Components** (palette),
      **Outline tree** (`OutlineTree.tsx`: select/hover sync both ways via the shared
      `workbench/hover.tsx` HoverProvider, expand/collapse, drag-reorder through the
      SAME pointer engine — rows are `data-designer-node-id` targets), **History**
      (`HistoryPanel.tsx`: labeled undo states, click to jump via `history.index`/
      `jumpTo`) and **Theme** (the ThemeEditor moved out of the preview pane).
- [x] **F2 — ToolbarPanel** (`6f975de`): undo/redo (out of the header), device
      simulator Desktop/Tablet/Mobile (drives `maxWidth` for canvas AND preview),
      view-mode switch + preview "play" button; center collapsed to a single
      `ViewPanel` column.
- [x] **F3 — ViewPanel modes** (`2042915`): design canvas; **two-way JSON editor**
      (`JsonEditor.tsx`: local buffer + debounce, `JSON.parse` → `migrate` (Zod),
      valid → one "Edit JSON" history step, invalid → inline issues + Revert, never
      crashes the canvas); live PREVIEW rendering the real, interactive `FormRenderer`.
- [x] **F4 — SettingsPanel** (`317e3bc`): ancestor breadcrumb via `ancestorsOf`
      (crumb click selects), close/reopen toggle, and the root Form selectable
      (empty-canvas click) + editable through the descriptor-driven
      `FormSettingsEditor` (FORM_META.settings on `layoutProps` + labelCol/wrapperCol,
      merged so authored offsets survive), generalizing Phase A. Header slimmed to
      mode + Save/Load.
- [x] **F5 — close:** `workbench/persist.ts` `usePersistentState` (guarded
      localStorage) persists composite tab, view-mode, device and settings-panel
      open state; Vitest coverage for OutlineTree / HistoryPanel / JsonEditor /
      SettingsPanel / persist; reviewer ran each sub-phase; no changeset (builder
      is private + changeset-ignored).

## Phase G — Reactions / Linkage (Formily core idea) ✅ DONE (2026-06-12)

Schema: optional `reactions[]` — `{ when: <JSONLogic>, then: { set?: visible|disabled|
value|options on a target field } }`. Pure engine in form-core; renderer subscribes via
`watch`. Generalizes the current single `visibleWhen`. NEVER eval.

**Summary:** Formily-style reactions/linkage shipped end to end. A field carries an optional
`reactions[]` (`{ when, target, effect: visible|disabled|value|options, value? }`); a pure
form-core engine (`computeReactions`/`computeNodeReactions`/`effectiveVisible`/
`collectValueEffects`) resolves them with `reactions > visibleWhen > static` precedence,
single-pass evaluation, and self-target + value-cycle guards. `buildZodSchema` computes
effects internally so validation stays consistent with rendering. The web renderer applies
the EffectMap via `watch` (visibility/disabled/options/value) and arrays are fully reactive
per row (merged row scope), lifting the Phase C always-visible limitation. The builder gained
a "Reactions" editor in the property panel (When/target/effect/value, simple-equals with a
JSON-panel fallback) and now offers Visibility for array item fields. JSONLogic only — never
eval. Changesets: form-schema (G1), form-core (G2, G4), form-renderer-web (G3, G4).

- [x] **G1 — schema:** `reactionSchema` = `{ when: JSONLogic, target: fieldName,
    effect: "visible" | "disabled" | "value" | "options", value? }`, optional
      `reactions[]` on `commonFields`. Additive → no version bump. (`2d2f10c`)
- [x] **G2 — form-core engine:** pure `computeReactions(schema, values) → EffectMap`
      (reuses `conditions.ts`). Deterministic single pass + cycle/self-target guard;
      precedence: `reactions` > `visibleWhen` > static props. Exhaustive tests. (`bf663f5`)
- [x] **G3 — renderer-web:** subscribe via RHF `watch`, apply EffectMap; fields
      hidden by reaction drop out of validation exactly like `visibleWhen` today. (`07c59d6`)
- [x] **G4 — per-row linkage:** lift the Phase C limitation — `visibleWhen`/
      `reactions` inside `array.itemFields` evaluate against the ROW's values. (`e8ae644`)
- [x] **G5 — builder UI:** ✅ "Reactions" section in the property panel — When (source
      field + equals, with a JSON-panel fallback for non-simple rules), target picker
      (self excluded), effect selector (resets value on change), per-effect value control
      (Show/Hide, Enable/Disable, Input, OptionsEditor). `App` computes top-level-scope
      `fieldNames`; the Visibility section is now offered for array item fields too. New
      `ReactionsEditor.tsx` + tests. Builder is changeset-ignored.

## Phase H — Modal / Drawer (FormDialog / FormDrawer) ✅ DONE (2026-06-12)

Imperative popup forms shipped on branch `feat/phase-h-dialog` (off
`feat/phase-g-reactions`). The decided OK trigger is a `forwardRef` handle + additive
`hideSubmit` prop, so the popup footer's OK drives validation and the popup stays open on
error (Formily-like UX). Plan: `C:\Users\ASUS\.claude\plans\rippling-percolating-graham.md`.

- [x] **H1 —** `openFormDialog(schema, opts)` / `openFormDrawer(schema, opts)` →
      `Promise<values | undefined>` — `imperative.tsx` mounts a `FormRenderer` in an antd
      Modal/Drawer on a detached `createRoot` (deferred unmount via `afterClose`/
      `afterOpenChange`), resolves once. `FormRenderer` wrapped in `forwardRef`
      (`FormRendererHandle.submit()`) + additive `hideSubmit`; runtime output unchanged
      without the new props. antd stays a peerDependency.
- [x] **H2 —** additive `array.editInDialog` (table variant only): rows render read-only +
      an Edit button opens that row's `itemFields` via `openFormDialog`, writing back with
      `useFieldArray.update`. Builder `ItemFieldsEditor` gained an "Edit rows in a dialog"
      checkbox. Additive schema prop → no version bump.
- [x] **H3 —** jsdom portal tests (`imperative.test.tsx`: dialog OK/cancel/validation-blocks,
      drawer OK, table row-edit write-back, ref.submit/hideSubmit) + changesets
      (form-renderer-web minor, form-schema minor; builder changeset-ignored).

---

## Long-term (post-H) — beyond Formily parity

Ordered by value; each is a normal phase with the same Closing Loop.

## Phase I — Templates & presets ✅ DONE (2026-06-12)

First long-term phase, shipped on branch `feat/phase-i-templates` (off `main` after the
E→H merge). Builder-only → changeset-ignored, no changeset. Additive, no `formVersion` bump.
Plan: `C:\Users\ASUS\.claude\plans\radiant-sauteeing-reef.md`.

- [x] **I1 — Export / Import form JSON** (`5e1b583`): new pure `apps/builder/src/io.ts`
      (`serializeForm` / `parseFormFile`, reusing `@org/form-schema` `migrate` for the
      untrusted-JSON pipeline). `App` gained `onExportForm` (Blob download, mirroring
      `onExportTheme`) + `onImportForm` (antd `Upload` `beforeUpload→false`, handled
      locally) and a shared `loadSchema` helper that now also backs backend `onLoad`.
      Header: Export + Import buttons. Tests `io.test.ts` (5).
- [x] **I2 — Template gallery** (`2860e75`): `apps/builder/src/templates.ts`
      (`BUILTIN_TEMPLATES` — Blank/Contact/Employee onboarding/Feedback survey/Event
      registration; two seeded from `examples/form.v{1,3}.json`, all validated via
      `migrate`) + `useUserTemplates()` (guarded localStorage via `usePersistentState`).
      `TemplateGallery.tsx` antd Modal (Starters + Your templates cards, Use/Save current/
      Delete) launched from a header **Templates** button; `onUse` reuses `loadSchema`.
      Tests `TemplateGallery.test.tsx` (4). Builder now 115 tests.
- [x] **I3 — close:** typecheck 15/15, full suite green, biome clean on Phase I files
      (repo-wide CRLF format artifact pre-existing, ignored), reviewer PASS (no required
      fixes). **Deferred hardening (reviewer note):** user templates replay their stored
      schema raw on Use — correct today since every saved schema is current-version, but if
      `CURRENT_FORM_VERSION` ever bumps, add a `migrate()` on rehydrate. No changeset.

## Phase J — Data sources, level 2 ✅ DONE (2026-06-12)

Shipped on branch `feat/phase-j-datasources` (off `feat/phase-i-templates`). A select's remote
`dataSource` went from a single `dependsOn` parent to **multi-field params + caching**, with a
real builder UI. Additive → no `formVersion` bump. Plan:
`C:\Users\ASUS\.claude\plans\magical-skipping-wreath.md`. Decisions: flexible `params: {name, from}[]`
mapping (query-param name decoupled from source field), `ttlMs` in schema → react-query
`staleTime`, scope stays `select`-only (radio keeps static options).

- [x] **J1 — schema** (`f684da8`): extracted `selectDataSourceSchema`; added optional
      `params: { name, from }[]` (multi-field) + `ttlMs` (cache). `dependsOn` kept as back-compat
      shorthand. Parse test. Changeset form-schema minor.
- [x] **J2 — form-core** (`eb72813`): `buildDataSourceUrl`/`fetchDataSourceOptions` now take a
      **values record** instead of a single value; new `dataSourceDeps(ds)` (all dep field names) + `dataSourceReady(ds, values)` (every dep present). `buildDataSourceUrl` applies `dependsOn` + each `params[]`. Renderer call sites bridged mechanically to stay green. `datasource.test.ts`
      rewritten + multi-param cases. Changeset form-core minor.
- [x] **J3 — renderer-web** (`56a56b8`): `SelectControl` reads a `depValues` record over
      `dataSourceDeps`, gates the fetch until ALL deps present (`dataSourceReady`), keys react-query
      on every dep value, sets `staleTime` from `ttlMs`, and the empty-state lists each missing
      field. `renderNode` builds `depValues` from `scopeValues` (per-row scope, G4 caveat preserved).
      New multi-param + ttl-cache tests. Changeset form-renderer-web minor.
- [x] **J4 — builder** (`3b53c28`): new `DataSourceEditor.tsx` — Static↔Remote `Segmented` toggle;
      remote authors url/labelKey/valueKey/ttlMs + a params editor (param name + source-field
      picker reusing `condFields`). Writing one source clears the other; a legacy `dependsOn`
      surfaces as one param row and normalizes to `params` on edit. Wired into `FieldForm` for
      select; `optionsSetting` removed from select's registry settings (radio keeps it).
      `DataSourceEditor.test.tsx` (5). Builder changeset-ignored.
- [x] **J5 — close:** typecheck 15/15, full suite green (one container test is a known parallel-load
      flake — passes in isolation), biome clean on new files (CRLF baseline ignored), reviewer PASS
      each sub-phase. Builder now 120 tests.

## Form-parity completion — K→O (decided 2026-06-12)

Cross-checked the form builder against an external Formily/Designable feature analysis
(`~/Downloads/formily-analysis.md`). The **form runtime** gaps below are MUST-HAVE and run
sequentially K→O (user decision 2026-06-12); the previously-planned i18n/workflow/native/docs
shift down to **P–S**. Backend (NestJS/PG/Redis, analysis Layer 8) stays a long-term track —
NOT in this scope. Architecture stays Zod-contract + RHF + JSONLogic; we do NOT clone
Formily's reactive engine, `x-*` JSON-Schema, or `{{}}` expression language. Every step is
additive → old JSON parses → **no `CURRENT_FORM_VERSION` bump** unless an existing shape
changes. Each phase keeps the Closing Loop (typecheck + test → reviewer → changeset → commit).

- [x] **K — Display patterns & conditional required ✅ DONE (2026-06-12).** Added optional
      `readOnly?`/`readPretty?` to `commonFields` (two additive booleans, NOT a `pattern` enum;
      precedence `readPretty > readOnly > disabled > editable`) and widened
      `reactionEffectSchema` with `"required"`. form-core: `FieldEffects.required` +
      `applyEffect` case; `leafZod(node, requiredOverride?)` lets a reaction `required` effect
      win over the static flag/rule (both directions — true requires, false un-requires), at the
      top level and per array row (`rowEffects`), so validation matches rendering. renderer-web:
      `FieldPreview`/`previewText` (PreviewText read view), `readOnly` on text/number inputs
      (other controls fall back to preview), required asterisk = `eff?.required ?? node.required`,
      and a form-wide `readPretty` review prop (hides Submit). Builder: universal Pattern select in
      PropertyPanel + a "Require / optional" reaction effect in ReactionsEditor. Tests across
      schema/core/renderer/builder. Changeset `.changeset/interaction-patterns-k.md` (minor:
      form-schema/form-core/form-renderer-web; builder changeset-ignored). reviewer PASS.
      KNOWN/ACCEPTED: a per-field readPretty/readOnly field that is `required`+empty still blocks
      submit (same as the existing `disabled` behavior); form-wide readPretty is safe (Submit
      hidden). Plan: `C:\Users\ASUS\.claude\plans\unified-doodling-metcalfe.md`.
- [x] **L — Essential field types (Upload, Checkbox.Group, rich props) ✅ DONE (2026-06-12).**
      Shipped on branch `feat/phase-l-fields` (off `feat/phase-k-patterns`). Additive → old JSON
      parses → no `CURRENT_FORM_VERSION` bump. Plan:
      `C:\Users\ASUS\.claude\plans\shiny-juggling-yao.md`.
      - **L1 — schema:** new `upload` (`accept?`/`maxCount?`/`listType?`, value = array of
        `uploadFileSchema` = the serializable `UploadFile` subset `{uid,name,url?,status?}`) and
        `checkbox-group` (reuses `optionSchema`/`selectDataSourceSchema`, value = array of option
        values). Widened `number` with `step?`/`precision?` and `select` with
        `tags?`/`showSearch?`/`allowClear?`. Both leaves join `LeafField` + `fieldNodeSchema`.
        Changeset form-schema minor.
      - **L2 — form-core:** `leafZod` cases — `checkbox-group` = array (required ⇒ min 1),
        `upload` = `z.array(z.any())` (required ⇒ min 1, `maxCount` ⇒ max). Both flow through the
        existing reaction-`required` override + array-row paths. Changeset form-core minor.
      - **L3 — renderer-web:** extracted a shared `useRemoteOptions` hook from `SelectControl`;
        new `CheckboxGroupControl`; `FieldControl` cases for `checkbox-group` + `upload` (antd
        `Upload`, local-only `beforeUpload→false` unless `settings.submitUrl` → `action`);
        `number` step/precision; `select` tags (wins over multiple)/showSearch/allowClear;
        `previewText` for both new types; `schemaDefaults` seeds the array-valued leaves `[]` so a
        `required` rule surfaces its custom message. Changeset form-renderer-web minor.
      - **L4 — builder:** registry metas for `upload` (Advanced) + `checkbox-group` (Choice),
        number step/precision + select tags/showSearch/allowClear descriptors; `DataSourceEditor`
        widened to `SelectField | CheckboxGroupField`, wired into PropertyPanel for both. Builder
        changeset-ignored.
      - **L5 — close:** typecheck 15/15, full suite green (the one `FormRenderer.containers` array
        test is the known parallel-load timeout flake — passes in isolation), biome clean on new
        files (CRLF baseline ignored), reviewer PASS (no required fixes). NEXT: Phase M.
- [x] **M — Hierarchical & range inputs ✅ DONE (2026-06-13).** Shipped on branch
      `feat/phase-m-hierarchical` (off `feat/phase-l-fields`). Additive → old JSON parses →
      no `CURRENT_FORM_VERSION` bump. Plan: `C:\Users\ASUS\.claude\plans\imperative-skipping-brook.md`.
      Decisions (asked in Vietnamese): remote tree dataSource IS in scope (`childrenKey`),
      tree options edited by an INLINE RECURSIVE editor (not drill-path / JSON).
      - **M1 — schema:** recursive `treeOptionSchema` (`TreeOption {label,value,children?[]}`,
        explicit `z.ZodType` + `z.lazy`); `selectDataSourceSchema.childrenKey?` (rows map
        recursively into a tree); new leaves `cascader` (tree options + dataSource, value =
        path array), `tree-select` (`multiple?`), `date-range`/`time-range` ([start,end]
        tuple); `datePickerVariantSchema` (`date|week|month|quarter|year`) as `picker?` on
        `date` + `date-range`. Changeset form-schema minor.
      - **M2 — form-core:** `leafZod` cases — cascader = path array (required ⇒ min 1),
        tree-select mirrors select (scalar refine / array min 1 per `multiple`), ranges
        assert a full 2-tuple when required (shape stays renderer-owned, antd clear's null
        accepted when optional). `fetchDataSourceOptions` maps rows recursively via
        `mapRow` when `childrenKey` is set; `DataSourceOption` gains `children?` (flat
        sources byte-identical). Changeset form-core minor.
      - **M3 — renderer-web:** `OptionSourced` widened to the 4 option-sourced types +
        `isOptionSourced` guard (depValues gating); `CascaderControl` (native
        `{label,value,children}` shape) + `TreeSelectControl` (explicit `fieldNames` —
        TreeSelect's default display field is `title`); `DatePicker.RangePicker`/`TimePicker.
        RangePicker` cases (raw dayjs tuple in RHF, no serialization, like `date`); `picker`
        pass-through; previewText — cascader path joined " / " (`findTreeLabel` helper),
        tree-select labels resolved anywhere in the tree, ranges "start ~ end";
        `schemaDefaults` seeds `[]` for cascader + multiple tree-select. New
        `FormRenderer.tree.test.tsx` (7) + range/picker tests in fields suite. Changeset
        form-renderer-web minor.
      - **M4 — builder:** registry metas (cascader/tree-select in Choice, date-range/
        time-range in Date & time, shared `pickerSetting` select on date + date-range,
        `multiple` checkbox on tree-select); new `TreeOptionsEditor.tsx` (inline recursive,
        indent per depth, + child / ✕ per row, pure path-based `updateAt`); DataSourceEditor
        widened to the 4 types (static mode renders TreeOptionsEditor for the tree types,
        remote mode gains a "Children key (tree)" input); PropertyPanel uses the exported
        `isOptionSourced` guard. Palette freeze test updated by design. Builder
        changeset-ignored; builder now 129 tests.
      - **M5 — close:** typecheck 15/15, full suite green (the known
        `FormRenderer.containers` parallel-load timeout flake passes in isolation), biome
        clean on Phase M files, reviewer PASS (no required fixes). NEXT: Phase N.
- [x] **N — Validation depth ✅ DONE (2026-06-13).** Shipped on branch
      `feat/phase-n-validation` (off `feat/phase-m-hierarchical`). Additive → old JSON parses →
      no `CURRENT_FORM_VERSION` bump. Plan: `C:\Users\ASUS\.claude\plans\imperative-skipping-brook.md`.
      Decisions (asked in Vietnamese): `validateTrigger` is FORM-LEVEL only
      (`settings.validateTrigger`, RHF `mode` is global); async protocol = GET
      `url?value=<v>&name=<field>` → JSON `{ valid, message? }`.
      - **N1 — schema:** `validationRuleSchema` gains `severity?: "error"|"warning"`
        (`validationSeveritySchema`) + a `cross` type with a SAFE JSONLogic `rule` record;
        `asyncValidatorSchema {url, message?, debounceMs?}` joins `commonFields`;
        `settings.validateTrigger` (`validateTriggerSchema`). Changeset form-schema minor.
      - **N2 — form-core:** `leafZod` refactored over a shared `leafZodWith(node, rules,
        requiredOverride?)` core — THE single severity filter (blocking schema sees only
        error-severity non-cross rules; a warning-severity `required` rule no longer derives
        requiredness). `withCrossChecks` field-level superRefine evaluates error cross rules
        via `evalRule` against the build scope (merged row scope in arrays, issues land on
        the field's path). `walkLeaves` (lockstep with buildShape) powers `collectWarnings`
        (dotted-path warning map) + `collectAsyncFields`. New `async-validator.ts`
        (`buildAsyncValidatorUrl`/`checkAsyncValidator`, injectable fetch, only explicit
        `valid:false` is invalid, throws on !ok). Changeset form-core minor.
      - **N3 — renderer-web:** `settings.validateTrigger` → RHF `mode`/`reValidateMode`
        (onBlur needs a boxless display:contents wrapper threading `field.onBlur`, rendered
        ONLY under that trigger); async resolver layer after the Zod pass (per-path/value
        memo in a ref, debounce-sleep + supersede check, zod-error/empty-value skip,
        fail-OPEN on network failure, `setErrorAtPath` builds arrays for row paths);
        warnings via `collectWarnings` → `validateStatus="warning"` + help (error wins;
        not touched-gated by design). Tests: validation (trigger ×3), warnings (5),
        async (7). Changeset form-renderer-web minor.
      - **N4 — builder:** severity Select per rule (default error serializes away — `update`
        now deletes undefined keys); `cross` rule type in STRING_RULES/NUMBER_RULES with a
        simple comparator builder (`readSimpleRule` ==/!=/>/>=/</<=, left field, right
        Field|Value toggle, numeric literals coerced; complex → JSON-panel hint); "Remote
        check" block (URL/message/debounce) on every leaf; FormSettingsEditor gains a
        bespoke `setSettingKey` merge (settings ≠ layoutProps) + "Validate when" select.
        `PropertyPanel.validation.test.tsx` (14); builder now 143 tests. Changeset-ignored.
      - **N5 — close:** typecheck 15/15, suites green (known parallel-load timeout flakes
        pass in isolation), biome on Phase N files (+ a11y ignore on the onBlur wrapper),
        reviewer PASS (no required fixes). NEXT: Phase O.
- [ ] **O — Multi-step wizard (FormStep).** Schema: `steps` container + `step` pane
      (pane-as-node like `tabs`/`tab-pane`, structurally restricted). renderer-web: a Steps
      header + next/prev nav that validates the current step before advancing (per-step Zod
      subset), progress indicator, Submit only on the last step. Builder: drag panes, step
      reorder, settings for titles/descriptions. The drag engine + pane handling reuse the
      tabs/collapse machinery from Phase D/E.

## Long-term (post-O) — P→S + backend

- [ ] **P — i18n:** optional `locale` map for labels/placeholders/validation messages
      (additive). Renderer picks a locale; builder edits per-locale strings.
- [ ] **Q — Workflow ↔ form integration:** workflow nodes reference forms by id
      (contract already in `workflow-schema`); builder UX to bind a form to a node;
      form submission advances the engine.
- [ ] **R — React Native renderer:** un-defer `form-renderer-native` once the web
      feature set stabilizes — same contract, single-column layout.
- [ ] **S — Docs & release:** a playground/docs site (Vite) with live examples per
      feature; first versioned npm release train via Changesets.
- [ ] **Backend track (long-term, separate):** NestJS + PostgreSQL (JSONB schema) +
      Redis cache + Submissions/FormVersions entities + REST API per analysis Layer 8.
      Deferred until the form feature set above stabilizes.

---

## How to resume in a fresh session

**Phase F is COMPLETE (F1–F5 committed on `feat/phase-f-workbench`).** Next up is
**Phase G — Reactions / Linkage**. After `/clear`, resume with:

> Read AGENTS.md and EXPANSION.md (Phase G section). Phases A–F are done — the builder is a
> 3-column workbench (`apps/builder/src/workbench/`): CompositePanel (Components/Outline/
> History/Theme) | Toolbar + ViewPanel (Design / two-way JSON / Preview) | SettingsPanel
> (breadcrumb + descriptor-driven editors, root Form included). The canvas is WYSIWYG
> (`DesignCanvas.tsx`) on the pointer drag engine (`useDragon.ts` + `engine/`). Phase G is
> schema + form-core work first (reactionSchema, computeReactions), then renderer + builder
> UI. Enter plan mode and plan Phase G before implementing; follow the Closing Loop.

Context that saves re-discovery when resuming:

- The designer engine is `apps/builder/src/engine/{tree,uid,names,selection,hover,
clipboard,history,transform,field-path,move-helper,dragon}.ts` — read `tree.ts`'s header
  comment first; ops return the SAME root reference on invalid input, guard type is
  `InsertGuard` (`field-registry.metaGuard()` supplies it from the metas).
- `field-registry.ts` is the ComponentMeta registry: `behavior` (droppable/draggable/
  cloneable/deletable + allowAppend/allowParents), `canInsert`/`metaGuard`, `newField`,
  `named`. **Containers are still `showInPalette:false`** — they're authored by dragging
  generic ones in / nesting; Phase F's CompositePanel decides how they appear in the
  Components tab.
- The canvas: `DesignCanvas.tsx` renders `<FormRenderer designMode nodeWrapper>` and wraps
  each node in a `NodeShell`; `useDragon.ts` is the pointer engine; `App.tsx` holds the tree
  in `useHistory<TreeNode>`, owns selection (`SelectionState`) + clipboard, and routes
  PropertyPanel edits through `transform.applyFieldEdit` (containers patch, leaves replace).
  The path→uid bridge is `DesignCanvas.buildPathIndex` (positional, migrate-proof).
- `FormRenderer` (renderer-web) has additive `nodeWrapper`/`designMode` props (E1) —
  reuse them for Phase F's live PREVIEW / JSONTREE view modes.
- Shared container helpers live in `packages/form-schema/src/containers.ts`
  (`isLayoutContainer`/`childrenOf`/`childrenKeyOf`) — use them, never type-switch.
- `pnpm biome check .` reports 27 pre-existing warnings (noExplicitAny in old
  tests/migrations etc.) — that count is the baseline, don't try to fix them.

For phases after D: enter plan mode, plan first, then implement following the
Closing Loop. Keep this file's phase statuses current (mark ✅ DONE with a date).
