---
"@org/form-renderer-web": minor
---

Add `FormRenderer.locale?` / `fallbackLocale?` (i18n — Phase P1). When `locale` is set, the
renderer resolves the schema's per-node `i18n` overrides via form-core's `localizeForm` as
the final step of its normalization pipeline (`migrate` → linked fields → localize), so every
downstream read — labels, placeholders, option labels, container titles, display-text, the
form title — renders in that locale with no per-control change. The imperative
`openFormDialog`/`openFormDrawer` wrappers forward `locale`/`fallbackLocale` too. Absent
`locale` ⇒ the authored default strings render, so runtime is byte-for-byte unchanged.
