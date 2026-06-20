---
"@org/form-renderer-native": minor
---

i18n P4 — native renderer locale parity. `FormRenderer` (native) gains optional
`locale`/`fallbackLocale` props and threads the schema through form-core's shared
`localizeForm` resolver after `migrate`, mirroring the web renderer. Per-node `i18n`
override maps collapse to plain strings before the (stubbed) leaf components map them.
Additive — absent `locale` ⇒ rendering unchanged. No `formVersion` bump.
