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

## Phase C — Array fields / Form List  ⭐ (user's top ask)  ← NEXT
Schema: new `array` node holding `itemFields: FieldNode[]` (recursive like `group`) +
optional `minItems`/`maxItems`. form-core: build a Zod array + item schema + min/max.
renderer-web: render ArrayItems/ArrayCards style (add/remove/reorder rows) via
`useFieldArray`; values become `name: [{...}, ...]`. builder: author into the array
template (needs nested drop — coordinate with Phase D). Heaviest dnd work.

## Phase D — Author-able layout containers
Unlock `group` in the builder and add Tabs/Collapse/Card/Grid containers. Upgrade the
dnd-kit canvas to **nested dropzones** + an **outline tree panel** (Designable-style) so
fields can be dragged into containers. Largest refactor of `apps/builder`.

## Phase E — Modal / Drawer (FormDialog / FormDrawer)
renderer-web helper that opens a sub-form in a modal/drawer and returns its values.
Builder configures modal content via the Phase C/D array/group mechanism.

## Phase F — Reactions / Linkage (Formily core idea)
Schema: optional `reactions[]` — `{ when: <JSONLogic>, then: { set?: visible|disabled|
value|options on a target field } }`. Pure engine in form-core; renderer subscribes via
`watch`. Generalizes the current single `visibleWhen`. NEVER eval.

## Phase G — Designable-grade editor UX (do last)
Outline tree drag-reorder, **meta-driven setting panel sized from a settings schema**
(generalize Phase A's descriptors), copy/paste nodes, two-way JSON view.

---

## How to resume in a fresh session
After `/clear`, start the next phase with:
> Read AGENTS.md and EXPANSION.md. Enter plan mode. Continue the Formily-parity roadmap —
> the next unchecked phase is the one to do. Plan it first, then implement following the
> Closing Loop.

Keep this file's phase statuses current (mark ✅ DONE with a date as you finish each).
