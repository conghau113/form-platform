---
"@org/form-core": minor
---

Add `localizeForm(form, locale, fallbackLocale?)` (i18n — Phase P1). It deep-clones a form
and resolves every node's `i18n` overrides for one locale — leaf/container text attributes,
static option labels and the form title — falling back to `fallbackLocale` then the authored
default, and stripping the `i18n` maps so the result is plainly string-typed for every
downstream consumer. Descends containers and array item fields via the shared `childrenOf`.
Purely declarative (never eval); a form with no `i18n` round-trips unchanged.
