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

## Phase D — Designer engine & tree foundation  ← IN PROGRESS (D1–D5 done, NEXT: D6)
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
- [ ] **D6 — ComponentMeta registry v2:** extend `field-registry.ts` IN PLACE (keep
      every existing export). `FieldType = FieldNode["type"]` (widened), `NodeType =
      FieldType | "form"`; `ComponentBehavior { droppable, draggable, cloneable,
      deletable, allowAppend?, allowParents? }`; `ComponentMeta` adds behavior/icon/
      `showInPalette` (false for ALL containers in D)/`named` (false = nameless).
      SettingDescriptor gains `control:"select"` + choices (PropertyPanel TypeSettings
      gets the case). New entries: form (droppable only, settings = layoutProps
      descriptors), group(Object), tabs (allowAppend only tab-pane), tab-pane
      (allowParents [tabs]), collapse/collapse-panel mirror, card, grid (defaults
      cols:2), space. `canInsert(parent, child)` + `metaGuard(): InsertGuard`.
      `newField` skips `name` for named:false. PropertyPanel ITEM_TYPES filter →
      showInPalette-based. Guard tests incl. canInsert matrix + palette-unchanged.
- [ ] **D7 — transformer:** `engine/transform.ts` — `schemaToTree`/`fieldToTree`
      (strip children via childrenKeyOf, fresh uids), `treeToField`/`treeToSchema`
      (array ALWAYS emits itemFields even []; omit undefined optionals),
      `replaceField(root, uid, field)` (keeps target uid — PropertyPanel boundary).
      Transformer NEVER renames. Round-trip identity test for form.v1.json,
      form.v3.json + inline fixtures.
- [ ] **D7b — builder integration:** App.tsx switches `useHistory<TreeNode>`;
      onDragEnd → engine insert/move + metaGuard; selection → SelectionState +
      pruneSelection; PropertyPanel selected widens to FieldNode, named-only sections;
      Canvas takes root's TreeNode[] (title fallback label??title??name??type);
      `node-path.ts` → `engine/field-path.ts` walking `childrenOf` (fixes latent no-op
      patch bug for container children inside itemFields); DELETE EditorModel + flat
      ops + model.test.ts; Palette filters showInPalette. Flat canvas UX unchanged.
      NOTE: replaceField regenerates descendant uids — fine in D (only top-level
      selectable), Phase E must switch the settings panel to patchNode-style edits.
- [ ] **D8 — close:** reviewer subagent, changeset (minor: form-schema, form-core,
      form-renderer-web + builder note), mark Phase D ✅ here, update memory, commit.

## Phase E — WYSIWYG canvas + Designable-grade drag & drop
The canvas stops being a row list (`Canvas.tsx` today) and renders **real antd
components**, with Designable's pointer-driven drag engine and aux widgets — this is
what makes it *feel* like designable-antd.formilyjs.org.

- [ ] **E1 — design-mode rendering:** reuse `FormRenderer` with a new optional
      `nodeWrapper` render-prop (additive renderer-web API) so every node renders
      inside a shell `<div data-designer-node-id>`; inputs are made pointer-inert by
      a capture overlay (NOT `disabled`, so visuals stay true to runtime).
- [ ] **E2 — drag engine (Designable's "Dragon"):** pointer-event driver replacing
      dnd-kit on the canvas. Drag sources = palette resources + canvas nodes
      (incl. multi-selection). Hit-test: `document.elementFromPoint` → nearest node
      shell → a `MoveHelper` computes the closest direction (BEFORE/AFTER from the
      rect midline; INNER when over an empty droppable container), validates against
      D6 metas (`droppable`/`allowAppend`), and emits ONE tree `move`/`insert` op on
      drop. MoveHelper math is pure and unit-tested.
- [ ] **E3 — aux widgets (the Designable look in the screenshot):** insertion line,
      hover dashed outline + component name tag, selection box with floating toolbar
      (title / drag handle / copy / delete), drag ghost following the cursor, "+"
      placeholder inside empty droppable containers, canvas empty-state legend
      (Selection ⌘+Click · Copy ⌘+C/V · Delete).
- [ ] **E4 — shortcuts:** click select; ctrl/⌘+click multi-select; ctrl/⌘+A;
      copy/paste (paste regenerates uids + unique names); Delete; undo/redo
      ctrl/⌘+Z / ctrl/⌘+shift+Z — all routed through D5 operation state so canvas,
      outline and settings stay one model.
- [ ] **E5 — cleanup + close:** keep dnd-kit only if the palette still needs it,
      otherwise drop the dependency. Canvas smoke tests; changeset; reviewer.

## Phase F — Workbench shell (panel parity with the Designable playground)
Layout: CompositePanel (left) | Toolbar + Viewport (center) | SettingsPanel (right).

- [ ] **F1 — CompositePanel** with three tabs: **Components** (palette grouped by
      D6 resource groups), **Outline tree** (mirrors the model: select/hover sync
      both ways, expand/collapse, drag-reorder through the SAME MoveHelper as E2),
      **History** (named undo states, click to jump).
- [ ] **F2 — ToolbarPanel:** undo/redo buttons, device simulator switch
      (desktop/tablet/mobile canvas widths over the 24-col responsive grid),
      view-mode switch + preview "play" button.
- [ ] **F3 — ViewPanel modes** (Designable's DESIGNABLE/JSONTREE/PREVIEW):
      design canvas; **two-way JSON editor** (edits go through
      `formSchema.safeParse` → patch the tree on success, inline Zod errors on
      failure — never crash the canvas); live PREVIEW rendering the real,
      interactive `FormRenderer`.
- [ ] **F4 — SettingsPanel:** breadcrumb of the selected node's ancestor path
      (like "1. Form /"), pin/close, and PropertyPanel rendered ENTIRELY from D6
      meta descriptors — including the root Form settings (labelCol / wrapperCol /
      layout / size / colon / labelAlign…), generalizing Phase A.
- [ ] **F5 — close:** panel-state persistence, polish, tests, changeset, reviewer.

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
**Phase D is mid-flight (D1–D5 committed, D6 next).** After `/clear`, resume with:
> Read AGENTS.md and EXPANSION.md (Phase D section), then read the approved plan at
> `C:\Users\ASUS\.claude\plans\synthetic-wibbling-rabin.md`. D1–D5 are committed —
> continue from D6 WITHOUT re-planning. Implement D6 → D7 → D7b → D8 in order,
> one commit per step, `pnpm typecheck` + `pnpm test` + `pnpm biome check --write .`
> green before each commit.

Context that saves re-discovery when resuming:
- The D5 step refactors `apps/builder/src/history.ts` to delegate to a new pure
  `apps/builder/src/engine/history.ts`; the hook's public API must NOT change and
  the existing `src/history.test.ts` must pass unmodified.
- The engine (D4) is in `apps/builder/src/engine/{tree,uid,names}.ts` — read
  `tree.ts`'s header comment first; ops return the SAME root reference on invalid
  input, guard type is `InsertGuard`.
- Shared container helpers live in `packages/form-schema/src/containers.ts`
  (`isLayoutContainer`/`childrenOf`/`childrenKeyOf`) — use them, never type-switch.
- `pnpm biome check .` reports 27 pre-existing warnings (noExplicitAny in old
  tests/migrations etc.) — that count is the baseline, don't try to fix them.

For phases after D: enter plan mode, plan first, then implement following the
Closing Loop. Keep this file's phase statuses current (mark ✅ DONE with a date).
