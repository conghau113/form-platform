---
"@org/form-schema": minor
---

i18n P3: add optional `i18n` (locale → string) to `validationRuleSchema` and
`asyncValidatorSchema`, so a custom validation `message` can carry translations. Additive
optional → old JSON still parses → no `CURRENT_FORM_VERSION` bump.
