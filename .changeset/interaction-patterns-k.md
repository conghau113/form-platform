---
"@org/form-schema": minor
"@org/form-core": minor
"@org/form-renderer-web": minor
---

Add Formily-style field interaction patterns + conditional-required (Phase K). Additive →
old JSON still parses → no `CURRENT_FORM_VERSION` bump.

`form-schema` gains two optional pattern flags on every leaf (`commonFields`): `readOnly?`
and `readPretty?`, layered on the existing `disabled` flag (precedence `readPretty >
readOnly > disabled > editable`). `reactionEffectSchema` is widened with a `"required"`
effect so a reaction can toggle a target field's required-ness.

`form-core` resolves the new `required` reaction effect: `FieldEffects` carries an optional
`required`, and `buildZodSchema`'s `leafZod` takes a `requiredOverride` (the reaction wins
over the static `required` flag/rule, in both directions — `true` requires, `false`
un-requires). It applies at the top level and per array row (via `rowEffects`), so
validation stays consistent with what the renderer shows.

`form-renderer-web` renders `readPretty` fields as plain read text (a PreviewText-style
view: option labels, Yes/No, masked passwords, formatted dates), renders `readOnly`
text/number inputs non-interactively (other controls fall back to the read view), reflects
a reaction `required` effect in the field's asterisk, and gains a form-wide `readPretty`
prop for a read-only review of a whole form (Submit hidden).
