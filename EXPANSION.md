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
- Depth: **Full Formily-style** — adopt Formily's *patterns* (component registry,
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

## Phase D — Designer engine & tree foundation  ✅ DONE (2026-06-11)
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
      `describeField(FieldType)` unchanged. `SettingDescriptor` gained `control:"select"`
      + `choices`; PropertyPanel `TypeSettings` renders it. `model.ts` `newField` is now
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

## Phase E — WYSIWYG canvas + Designable-grade drag & drop  ✅ DONE (2026-06-11)
The canvas stopped being a row list and now renders **real antd components**, with
Designable's pointer-driven drag engine and aux widgets — this is what makes it *feel*
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

## Phase G — Reactions / Linkage (Formily core idea)
Schema: optional `reactions[]` — `{ when: <JSONLogic>, then: { set?: visible|disabled|
value|options on a target field } }`. Pure engine in form-core; renderer subscribes via
`watch`. Generalizes the current single `visibleWhen`. NEVER eval.

- [ ] **G1 — schema:** `reactionSchema` = `{ when: JSONLogic, target: fieldName,
      effect: "visible" | "disabled" | "value" | "options", value? }`, optional
      `reactions[]` on `commonFields`. Additive → no version bump.
- [ ] **G2 — form-core engine:** pure `computeReactions(schema, values) → EffectMap`
      (reuses `conditions.ts`). Deterministic single pass + cycle/self-target guard;
      precedence: `reactions` > `visibleWhen` > static props. Exhaustive tests.
- [ ] **G3 — renderer-web:** subscribe via RHF `watch`, apply EffectMap; fields
      hidden by reaction drop out of validation exactly like `visibleWhen` today.
- [ ] **G4 — per-row linkage:** lift the Phase C limitation — `visibleWhen`/
      `reactions` inside `array.itemFields` evaluate against the ROW's values.
- [ ] **G5 — builder UI:** "Reactions" section in the settings panel (target picker
      from the outline tree, condition builder, effect selector) + close.

## Phase H — Modal / Drawer (FormDialog / FormDrawer)
- [ ] **H1 —** `openFormDialog(schema, opts)` / `openFormDrawer(schema, opts)` →
      `Promise<values | undefined>` — imperative renderer-web helpers wrapping
      `FormRenderer`; antd stays a peerDependency.
- [ ] **H2 —** array `variant: "table"` gains optional row-editing-in-dialog
      (additive prop).
- [ ] **H3 —** jsdom portal tests + changeset.

---

## Long-term (post-H) — beyond Formily parity
Ordered by value; each is a normal phase with the same Closing Loop.

- [ ] **I — Templates & presets:** save/load form templates (JSON export/import is
      free once F3 exists); a starter gallery in the builder.
- [ ] **J — Data sources, level 2:** build on `form-core/datasource.ts` — dependent
      selects (params from other fields via reactions), caching, loading/error states
      in renderer-web, builder UI to configure a datasource per select field.
- [ ] **K — i18n:** optional `locale` map for labels/placeholders/validation messages
      (additive). Renderer picks a locale; builder edits per-locale strings.
- [ ] **L — Workflow ↔ form integration:** workflow nodes reference forms by id
      (contract already in `workflow-schema`); builder UX to bind a form to a node;
      form submission advances the engine.
- [ ] **M — React Native renderer:** un-defer `form-renderer-native` once the web
      feature set stabilizes — same contract, single-column layout.
- [ ] **N — Docs & release:** a playground/docs site (Vite) with live examples per
      feature; first versioned npm release train via Changesets.

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
