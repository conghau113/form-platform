---
"@org/form-core": minor
---

i18n P3: localize validation messages. `localizeForm` now resolves the custom `message` of
each validation rule and async validator from its per-rule `i18n` map. New `messages.ts` ships
locale `ValidationMessages` packs (`en` verbatim + `vi`) with `registerMessages`/`resolveMessages`;
`buildZodSchema`/`collectWarnings` accept an optional `messages` pack and route every default
generated string (required/invalid/item & file bounds/format checks) through it. The pack's
optional `errorMap` localizes Zod's own generic codes for bare constraints. EN parity preserved:
absent pack ⇒ today's exact English (the `en` pack carries no `errorMap`).
