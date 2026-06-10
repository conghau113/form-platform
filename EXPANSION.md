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

## Phase D — Designer engine & tree foundation  ← NEXT
Rebuild the relevant parts of `@designable/core` as pure, tested TS (no UI yet), and
teach the contract the container/layout vocabulary Designable has. Heaviest refactor;
each step lands in its own commit with `pnpm typecheck` + `pnpm test` green.

- [ ] **D1 — schema (containers):** add container nodes `tabs` (panes with label +
      children), `collapse` (panels), `card` (title + children), `grid` (cols +
      children), `space` to the discriminated union. Optional/additive → no version
      bump; `migrate`'s walk recurses their children. Nested fixtures + round-trip tests.
- [ ] **D2 — schema (form-level layout):** optional `layoutProps` on the root —
      `labelCol`, `wrapperCol`, `layout` (horizontal/vertical/inline), `size`, `colon`,
      `labelAlign`, `labelWrap` — mirroring Designable's Form `defaultProps`
      (labelCol 6 / wrapperCol 12). Additive. Per-field decorator overrides optional.
- [ ] **D3 — form-core + renderer-web consume D1/D2:** `buildShape` treats layout
      containers as *transparent* for values (children hoist to the parent object —
      only `array` nests values); hidden container hides descendants. renderer-web
      renders antd `Tabs`/`Collapse`/`Card`/`Row+Col`/`Space` via `renderNode`
      recursion and applies `layoutProps` on the antd `Form`. Tests incl.
      container-inside-array and array-inside-tab.
- [ ] **D4 — designer tree model** (`apps/builder/src/engine/`): `TreeNode`
      { uid, node, children } with pure ops — `insertBefore/After`, `append`, `remove`,
      `move`, `clone` (uid+name regeneration) — guarded by metas (D6). Replaces the
      flat `EditorModel`; `node-path.ts` logic folds into it. Own commit + tests
      BEFORE any UI changes.
- [ ] **D5 — operation state:** pure modules for `Selection` (multi-select),
      `Hover`, `Clipboard`, and `History` generalized from `history.ts` to tree
      snapshots (undo/redo + named-state list for the History panel).
- [ ] **D6 — ComponentMeta registry v2:** extend `field-registry.ts` per Designable's
      `createBehavior`/`createResource`: per type — `droppable`,
      `allowAppend(parent, child)`, `draggable/cloneable/deletable` (root Form: all
      false, droppable true), palette resource (icon, group: Inputs/Layouts/Arrays/
      Displays), settings descriptors, `defaultProps`. Containers + `group` (Object)
      + `array` included; guard test seeds every entry and parses it.
- [ ] **D7 — transformer:** TreeNode tree ↔ `FormSchema` (the root Form node carries
      id/title/layoutProps). Round-trip test: schema → tree → schema is identity for
      every fixture.
- [ ] **D8 — close:** reviewer subagent, changeset, commit.

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
After `/clear`, start the next phase with:
> Read AGENTS.md and EXPANSION.md. Enter plan mode. Continue the Formily-parity roadmap —
> the next unchecked phase is the one to do. Plan it first, then implement following the
> Closing Loop.

Keep this file's phase statuses current (mark ✅ DONE with a date as you finish each).
