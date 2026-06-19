---
"@org/form-schema": minor
---

Add optional per-node `i18n` localization overrides (i18n — Phase P1). Every translatable
string can now carry an `i18n` map `attribute → locale → translated string`: leaf
`label`/`placeholder`/`helpText`/`tooltip`/`extra` (via `commonFields`), container
`label`/`title`/`description`, `display-text` `content`, plus a flatter `i18n` (locale →
label) on each static option and a form-level `i18n` for the `title`. Translations travel
with the node (robust to reordering) and the authored string stays the default/fallback.
All additive and optional ⇒ old JSON keeps parsing, so NO `formVersion` bump. form-core's
`localizeForm` resolves these at render time.
