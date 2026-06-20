---
"@org/form-renderer-web": minor
---

i18n P3: `FormRenderer` resolves a locale-aware validation message pack from its `locale`/
`fallbackLocale` (via form-core's `resolveMessages`) and threads it into `buildZodSchema`,
`collectWarnings`, the zod resolver and the final parse — including the pack's `errorMap` at
parse time. With no `locale`, validation messages stay byte-identical English.
