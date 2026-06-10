---
"@org/form-schema": minor
"@org/form-core": minor
"@org/form-renderer-web": minor
---

Add the `array` (Form List) node — a repeatable set of fields (Phase C).

`form-schema` gains an `array` node, recursive like `group`: `{ type: "array", name,
label?, required?, minItems?, maxItems?, itemFields: FieldNode[] }`. Its value is a
nested array of row objects (`name: [{...}, {...}]`). The change is purely additive:
existing JSON without an array still parses, so `CURRENT_FORM_VERSION` is not bumped
(same precedent as Phases A/B). `migrate`'s walk now also recurses `itemFields` so future
migrations reach fields nested in arrays.

`form-core` compiles an array node in `buildZodSchema` into a Zod array of row objects:
the item schema is built from `itemFields` (the `walk` was refactored into a reusable
`buildShape`), and `minItems`/`maxItems`/`required` (≥1) bound the list length. Item
fields are validated as always-visible — a single static schema can't model per-row
`visibleWhen` (a known limitation, candidate for the later reactions phase). New tests
cover nested required item fields, min/max bounds and the required-as-minItems rule.

`form-renderer-web` renders an array node as a Form List of antd cards via
`useFieldArray`, with add / remove / reorder controls; each row's controls bind to
`name.{index}.{child}` through a name-prefix threaded into the renderer. The builder lets
you drag an "Array (list)" block onto the canvas and define its item columns in a compact
PropertyPanel editor (deeper per-item config and drag-based nesting land in the next
phase).
