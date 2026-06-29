---
"@org/form-renderer-web": patch
---

Honor a form's authored `defaultLocale` when resolving default validation
messages (UX#5). Previously the message pack came only from the `locale` /
`fallbackLocale` props, so a form written in e.g. Vietnamese (`defaultLocale:
"vi"`) rendered without a `locale` prop still surfaced English defaults
("… is required"), mixing with the author's localized custom messages.

Now `resolveMessages(locale ?? form.defaultLocale, fallbackLocale ??
form.defaultLocale)`: the requested locale still wins, and a form with no
`defaultLocale` keeps today's exact English (EN parity preserved). Label/i18n
localization is unchanged — `defaultLocale` only selects the validation-message
pack, since the authored strings already ARE in that language. The i18n
machinery in `@org/form-core` already supported this; only the renderer wiring
changed.
