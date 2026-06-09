---
"@org/form-schema": minor
"@org/form-core": minor
---

Add field-level validation rules (Phase B).

`form-schema` gains an optional `validations[]` on every leaf field — an array of
`{ type: "required" | "len" | "min" | "max" | "pattern" | "format", value?, format?:
"email" | "url" | "phone", message? }` rules. The change is purely additive: existing
JSON without the key still parses, so `CURRENT_FORM_VERSION` is not bumped (same
precedent as the Phase A additions).

`form-core` compiles each rule into the Zod schema in `buildZodSchema`: string-like
fields honor `len`/`min`/`max`/`pattern`/`format`, numeric fields honor `min`/`max`, and
a `required` rule is equivalent to the `required` flag (its `message` customizes the
text). Patterns are compiled with `new RegExp` inside a guarded try/catch — a malformed
pattern is skipped, never `eval`'d. Optional string fields with format/pattern rules
treat an untouched empty value as absent so they don't spuriously fail. Rules on a
hidden field don't run. New tests cover every rule kind, custom messages, the url/phone
formats and the malformed-pattern guard.

The builder's PropertyPanel renders a descriptor-driven "Validation" section: each field
type declares which rule kinds it offers (text/color → all string rules, number/slider →
min/max), and the panel edits the rule list inline.
