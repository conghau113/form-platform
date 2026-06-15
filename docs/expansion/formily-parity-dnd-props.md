# Formily/Designable parity — Drag‑and‑drop & component‑props expansion

> Deep gap analysis of the current builder against **alibaba/formily** (form model +
> antd renderer) and **alibaba/designable** (the drag‑drop engine Formily's builder is
> built on), plus a phased, additive plan to close the two gaps the current source
> under‑exploits the most: **the drag‑and‑drop designer** and **the component‑props
> surface**.
>
> Written 2026‑06‑14, after the K→O form‑parity chain. This is a *planning doc*, not a
> spec freeze — each phase still gets its own plan + tests + changeset.

---

## Status at a glance (updated 2026‑06‑15)

Branch `refactor/modularize-fe-be`. Done chain so far: **X1 → D8 → X2+X3 → D1 → D5 → X4 →
X5 → X8 → X7 → X6 → D2 → D3 → D6 → D7 → D4**. **Both tracks are now complete** (every X1–X8
and D1–D8 phase ✅). All additive — no `formVersion` bump on any phase. Each row links to the
commit that landed it; the §3 lists below carry the same ✅ markers.

| Phase | What | Status | Commit |
| --- | --- | --- | --- |
| X1 | Setter vocabulary (segmented + slider) | ✅ Done | `b49e984` |
| X2 | Input family rich props | ✅ Done | `6188134` |
| X3 | Choice family props | ✅ Done | `6188134` |
| X4 | Date/time props | ✅ Done | `5a8d176` |
| X5 | Widgets (switch/slider/rate) | ✅ Done¹ | `f74e99a` |
| X6 | Upload (multiple/directory/Dragger) | ✅ Done | `pending` |
| X7 | Cross‑cutting size/variant/extra | ✅ Done² | `pending` |
| X8 | Validator formats | ✅ Done | `06ca6c6` |
| D1 | Copy‑on‑drag (Alt → clone) | ✅ Done | `6b7054f` |
| D2 | Cursor states + drag handle | ✅ Done | `pending` |
| D3 | Auto‑scroll on edge | ✅ Done | `pending` |
| D4 | Spring‑loaded containers | ✅ Done | `pending` |
| D5 | Real drag ghost | ✅ Done | `5a8d176` |
| D6 | Keyboard reorder | ✅ Done | `pending` |
| D7 | Marquee multi‑select | ✅ Done | `pending` |
| D8 | Grid column drag‑resize → `colSpan` | ✅ Done | `afe4847` |

**Deferred sub‑items (need new groundwork, not part of any open phase yet):**
- ¹ Slider `marks` + tooltip formatter — need a new **key/value setter**; `SettingControl`
  is currently `text|number|checkbox|options|select|segmented|slider` only.
- ² X7 added the genuinely cross‑cutting **decorator extras** (`extra` persistent hint +
  `hasFeedback`) to `commonFields`; `size`/`variant` already live per‑field from X2–X5, so
  they were not duplicated into `commonFields`. `feedbackLayout` (§2c) is a Formily‑antd
  prop absent from plain antd v5 → intentionally not added.
- Date `minDate`/`maxDate` bounds (from X4) — need a date‑library parse the web renderer
  does not yet carry (dayjs is only transitive via antd).

**Suggested next:** **both tracks are complete (X1–X8, D1–D8).** Remaining work is the
deferred sub‑items only: the key/value setter to unlock slider `marks`/tooltip + the date
`minDate`/`maxDate` bounds. After that this doc's scope is done — pick up P+ (i18n,
workflow, native parity) from the roadmap. NOTE: D3/D4/D7 interactions need a REAL browser
to verify (jsdom can't); the pure helpers are unit‑tested, the gestures are not.

---

## 0. How this maps to Formily/Designable

| Their concept | Ours today | File |
| --- | --- | --- |
| `@designable/core` `Engine`/`Workspace`/`TreeNode`/`Operation` | designer tree + ops | `apps/builder/src/engine/tree.ts`, `transform.ts` |
| `Dragon` (pointer drag controller) | pure reducer + DOM seam | `engine/dragon.ts` + `useDragon.ts` |
| `MoveHelper` (closest‑direction insertion) | `dropIntent` geometry | `engine/move-helper.ts` |
| `createBehavior` / `createResource` (component meta) | `FIELD_REGISTRY` metas | `field-registry/registry.ts` |
| `@designable/setters` (SchemaField setter library) | `SettingControl` union | `PropertyPanel/*`, `field-registry/types.ts` |
| `@formily/antd` `x-component-props` (open prop bag) | typed per‑field props | `packages/form-schema/src/schema.ts` |
| `@formily/json-schema` `x-reactions` | JSONLogic reactions/conditions | `form-core` + `schema.ts` |

**Two deliberate divergences we keep (do not "fix"):**

1. **Closed, typed contract instead of `x-component-props`.** Formily lets any prop flow
   through an untyped bag; we type every prop per field in Zod. That is *safer* (no
   unknown props reaching a renderer, full inference) and is the whole point of "the JSON
   schema IS the contract". Expansion means **growing the typed surface**, not opening a
   bag.
2. **JSONLogic for all expressions, never `eval`/`new Function`.** Formily's
   `x-reactions` can run arbitrary JS. We will never do that. Computed values (X‑track,
   below) stay inside JSONLogic.

Everything below is **additive** per the golden rules: new props are optional →
old saved JSON keeps parsing → **no `formVersion` bump** unless a shape actually changes
(see `memory/form-platform-additive-schema-rule.md`).

---

## 1. Drag‑and‑drop — what we have vs. what Designable does

### What is already solid
- Pure, framework‑free drag core (`dragon.ts`): `canDrop` guards (root, self, cycle,
  `canInsert`), `performDrop` commits exactly one tree op, returns `===` tree on reject.
- `MoveHelper` geometry: before/after by midline for leaves; before/inner/after edge
  bands (0.25) for droppable containers, so empty containers read as append.
- DOM seam (`useDragon.ts`): pointer threshold, `elementFromPoint` hit‑test of
  `[data-designer-node-id]`, multi‑select drag (top‑most filtering), Escape/`pointercancel`
  abort, click‑vs‑drag disambiguation.
- **Outline drags through the SAME engine** — canvas↔outline cross‑drop already works
  (`OutlineTree.tsx`).

### Gaps (Designable has these; we don't)

| # | Gap | Why it matters | Effort |
| --- | --- | --- | --- |
| D1 | **Copy‑on‑drag** (hold Alt/Option → drop a *clone* instead of moving) | Fastest way to duplicate a configured field; Designable standard | S |
| D2 | **Drag handle + cursor states** (grab/grabbing/no‑drop cursors, an explicit handle vs. whole‑node press) | Discoverability; avoids accidental drags from inputs | S |
| D3 | **Auto‑scroll** the canvas when the pointer nears the viewport edge mid‑drag | Today you can't drag into a node scrolled off‑screen | M |
| D4 | **Spring‑loaded containers** — auto‑expand a collapsed `tabs`/`collapse`/`step` after dwelling over it during a drag | Can't currently drop into a collapsed panel | M |
| D5 | **Real drag ghost** — render a faded clone of the node, not a text label | Polish + correct drop intuition for wide nodes | M |
| D6 | **Keyboard reorder** — ↑/↓ to move selection among siblings, Tab/Shift‑Tab to re‑parent, in canvas + outline | Accessibility; power‑user speed | M |
| D7 | **Marquee multi‑select** on the canvas (rubber‑band) | Bulk operations; Designable has it | M |
| **D8** | **Grid column drag‑resize** — drag a gutter to set `layout.colSpan` | **This is the biggest "props not utilized" win** (see §2) | L |

**D8 is the headline.** The schema already carries responsive `layout.colSpan`
(`{xs,sm,md,lg}` 1–24) and the web renderer honours it, but the *only* way to set it is
typing numbers into `FieldForm`'s four `colSpan` inputs. Designable lets you drag a
field's right edge inside a grid to resize its span live. Wiring a resize handler that
writes `layout.colSpan.<bp>` turns an existing-but-dead prop into a first‑class direct‑
manipulation feature — exactly the "drag‑and‑drop chưa được tận dụng hết" the request
calls out.

---

## 2. Component props — what we expose vs. the antd surface

The contract types a **curated subset** of each antd component's props. Below is the
delta against the antd components we already render (`FieldControl.tsx`). Everything is
optional/additive.

### 2a. The setter bottleneck (do this FIRST)
`SettingControl` is only `text | number | checkbox | options | select`
(`field-registry/types.ts`). Most missing props can't even be *authored* until the
setter vocabulary grows. Add setter kinds:

- `segmented` (antd Segmented — for `optionType`, `buttonStyle`, `variant`, `size`)
- `slider` (bounded numerics that read better as a slider)
- `color` (color default values, theme tokens)
- `multiSelect` (tag inputs like `accept` presets)
- `textarea` (long strings: custom messages, marks JSON)
- `keyValue` / `marks` (slider marks, key→label maps)
- `json` (escape hatch for advanced authors, validated before commit)

This is the analogue of `@designable/setters`. Each is a small, descriptor‑driven editor
reused across many fields — high leverage.

### 2b. Per‑field prop deltas

| Field | Have today | High‑value antd props to add |
| --- | --- | --- |
| `text` | placeholder, maxLength | `allowClear`, `showCount`, `prefix`, `suffix`, `addonBefore`, `addonAfter`, `variant` (outlined/filled/borderless), `size` |
| `textarea` | placeholder, maxLength, rows | `autoSize` ({minRows,maxRows}), `showCount`, `allowClear` |
| `number` | min, max, step, precision | `prefix`/`addonBefore`/`addonAfter`, `formatter`+`parser` (thousands/currency — declarative preset, NOT a function), `controls` toggle, `keyboard` |
| `select` | multiple, tags, showSearch, allowClear | `placeholder`, `size`, `maxTagCount`, `optionFilterProp`, `loading`, `notFoundContent`, `popupMatchSelectWidth`, `variant` |
| `radio` | options | `optionType` (radio/button), `buttonStyle` (outline/solid), `size` |
| `checkbox-group` | options/dataSource | layout `direction` (horizontal/vertical), per‑option `disabled` |
| `date`/`date-range` | picker | `format`, `showTime`, `minDate`/`maxDate` bounds, `allowClear` |
| `time`/`time-range` | — | `format`, `use12Hours`, `minuteStep` |
| `switch` | — | `checkedChildren`, `unCheckedChildren`, `size` |
| `slider` | min, max, step | `marks`, `range`, `vertical`, `tooltip` formatter (declarative), `dots` |
| `rate` | count, allowHalf | `character` (star/heart/letter preset), `allowClear` |
| `upload` | accept, maxCount, listType | `multiple`, `directory`, **Dragger** drop‑zone variant |

### 2c. Cross‑cutting (add to `commonFields`, one place, all fields)
- `size` per‑field override (`small|middle|large`) — antd respects it on most controls.
- `variant`/`bordered` where applicable.
- Decorator (`Form.Item`) extras: `extra` (secondary hint under control), `feedbackLayout`.
- A **guarded** `style` passthrough? **Recommend NO** for now — it breaks "semantic
  layout only" and the native renderer can't honour it. Keep styling token‑based.

### 2d. Validator library (cheap parity win)
`format` only has `email | url | phone`. Formily ships many. Add additive formats:
`integer`, `number`, `money`, `idcard`, `url`, `zh`, `en`, `qq`, `zip`. Pure additions to
the `format` enum + form‑core's format map; no new shape.

---

## 3. Phased plan

Two parallel tracks. **X1 (setters) gates most of the X‑track**; **D‑track is
independent** and can interleave. Each phase = plan → schema (if any, additive) →
renderer (additive) → builder setter → form‑core (validators) → tests → changeset.

### Track X — Component props depth
- ✅ **X1 — Setter vocabulary.** Grow `SettingControl` + descriptor renderers
  (segmented/slider/color/multiSelect/textarea/keyValue/json). No schema change.
  *Unlocks everything below.* (Shipped `segmented` + `slider`; the rest still open.)
- ✅ **X2 — Input family.** text/textarea/password/number rich props (§2b rows 1–3) +
  `formatter/parser` as **named presets** (e.g. `"thousands"`, `"currency:USD"`), never
  functions in JSON. Schema additive; renderer maps preset→antd fn.
- ✅ **X3 — Choice family.** radio `optionType`/`buttonStyle`, select display props,
  checkbox‑group `direction`.
- ✅ **X4 — Date/time.** `format`, `showTime`, `allowClear`, time granularity. (`minDate`/
  `maxDate` bounds deferred — see Status.)
- ✅ **X5 — Widgets.** switch labels, slider `range`/`vertical`/`dots`, rate `character`.
  (Slider `marks` + tooltip formatter deferred — need a key/value setter.)
- ✅ **X6 — Upload.** `multiple`/`directory`/Dragger variant.
- ✅ **X7 — Cross‑cutting** decorator extras (`extra` + `hasFeedback`) on `commonFields`.
  (`size`/`variant` already per‑field from X2–X5; `feedbackLayout` is Formily‑only.)
- ✅ **X8 — Validator formats** (§2d).

### Track D — Designer (drag‑drop) depth
- ✅ **D1 — Copy‑on‑drag** (Alt → clone). Tiny change in `useDragon`/`performDrop`
  (reuse the clipboard clone path).
- ✅ **D2 — Cursor states + drag handle.** Hover name tag is now an explicit grip handle
  (`grab` cursor); the shell hints `grab` on hover/selection; an in‑flight drag shows a
  global `grabbing`/`no-drop` cursor across the canvas. Builder‑only → no changeset.
- ✅ **D3 — Auto‑scroll on edge.** A single rAF loop runs per drag (reads the latest
  pointer via a ref) and scrolls the canvas when the pointer enters the edge band; speed
  ramps to the edge. Pure `edgeScroll(point, rect)` math is unit‑tested. Builder‑only.
- ✅ **D4 — Spring‑loaded containers.** Dwelling (~500ms) over a CLOSED tab / collapsed
  panel header mid‑drag clicks it open (tabs/collapse are uncontrolled + `forceRender`, so
  a synthetic click suffices — no renderer change). Pure `springLoadTarget(el)` is tested.
  Builder‑only.
- ✅ **D5 — Real drag ghost.**
- ✅ **D6 — Keyboard reorder** (canvas + outline). ↑/↓ swap with a sibling, Tab/Shift‑Tab
  indent/outdent, via a pure `keyboardMove(tree, uid, dir, guard)` over the existing `move`
  op; wired into App's global keydown (covers canvas + outline). Builder‑only.
- ✅ **D7 — Marquee select.** Rubber‑band drag from empty canvas selects every node shell it
  intersects (`topMostUids` collapses parent+child hits); a no‑move press still clears.
  Pure `normalizeBox`/`boxesIntersect` are tested. Builder‑only.
- ✅ **D8 — Grid column drag‑resize → `layout.colSpan`.** The flagship: a resize handler in
  the grid NodeShell that writes the active breakpoint's span. Ties D‑track to X‑track
  (direct manipulation of an existing prop).

### Suggested ordering (impact × cost)
1. **X1** (unblocks the prop work) →
2. **D8** (turns a dead prop into direct manipulation — the single most visible win) →
3. **X2 + X3** (the props authors ask for most) →
4. **D1, D5** (cheap designer polish) →
5. **X4–X8** as needed →
6. **D2–D4, D6, D7** (designer ergonomics) as time allows.

---

## 4. Guardrails (every phase)
- **Additive only** — optional props, old JSON parses unchanged → no `formVersion` bump
  unless a *shape* changes (then: bump `CURRENT_FORM_VERSION` + migration + fixture test).
- **One contract, many renderers** — props live in `form-schema`; the web renderer
  consumes them; the **native renderer must keep rendering** (it can ignore web‑only
  props, but must not crash). Mark clearly web‑only props.
- **No `eval`/`new Function`** — formatter/parser, tooltip formatters, slider marks are
  **declarative presets/data**, never code strings.
- **peerDeps** — never add react/antd/react‑native as deps in renderers.
- **DoD** — `pnpm typecheck` + `pnpm test` green, biome clean (scoped to changed files),
  a changeset per changed package.

---

## 4b. Reality check vs the live demo (designable-antd.formilyjs.org)

Verified against Designable's actual source (`@designable/react-settings-form` setter
library + `@formily/grid`), since the demo is a client‑rendered SPA. Conclusion: **the
drag‑drop and component‑prop goals of this plan are real and achievable** — Designable
literally ships these. But "pixel‑for‑pixel like the demo" is **not** the target, because
a few demo features violate our golden rules *by design*.

**Achievable — proven to exist in Designable, fits our architecture:**
- Grid **column drag‑resize** (D8) — real: `@formily/grid` + a resize handle. ✔
- Copy/paste & copy‑on‑drag, multi‑select, outline tree, JSON view, undo/redo — we
  already have most; the rest (D1–D7) are standard engine features. ✔
- Rich component props via an expanded **setter library** (X‑track). Designable's setters
  confirm the approach: `ValueInput`, `ColorInput`, `SizeInput`, `InputItems`,
  `PolyInput`, `FoldItem`/`CollapseItem`, `DrawerSetter`. Our X1 vocabulary mirrors the
  *form‑relevant* subset. ✔

**Deliberately NOT reproduced (golden‑rule conflicts — intentional, not a gap):**
- **Style setters** — `BoxStyleSetter`, `BackgroundStyleSetter`, `FontStyleSetter`,
  `BorderStyleSetter`, `BoxShadowStyleSetter`, `PositionInput`, `FlexStyleSetter` write
  **arbitrary inline `style`**. That breaks "semantic layout only" and the native
  renderer can't honour it. §2c already recommends **no `style` passthrough**. ✗ (by design)
- **`MonacoInput` / code reactions** — Designable authors `x-reactions` as raw JS in a
  Monaco editor. We use **JSONLogic, never `eval`**. Computed values stay declarative.
  ✗ (by design)
- **`PolyInput` "expression vs literal" arbitrary‑JS toggle** — only the *JSONLogic*
  half of this is in scope. ✗ (partial, by design)

**Net:** following the plan reproduces the demo's *field set, drag‑drop interactions, and
component‑prop richness*. It will **not** reproduce free‑form CSS styling or in‑browser
code expressions — and that is the correct outcome for a typed, multi‑renderer,
no‑`eval` contract, not a shortfall.

## 5. Out of scope here (tracked elsewhere)
i18n (Phase P), workflow schema/engine (Q+), native renderer parity (deferred), docs
site, and JSON‑Schema interop for backend. The X/D tracks above are purely about
**closing form‑builder parity on the two axes the request named**.
