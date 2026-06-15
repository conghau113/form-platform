---
"@org/form-core": minor
---

Implement the X8 named `format` checks. `buildZodSchema` now maps `integer`, `number`,
`money`, `idcard`, `zh`, `en`, `qq` and `zip` to fixed regexes (via a `FORMAT_CHECKS`
table) with sensible default messages; `email`/`url` keep using Zod's built-ins and
`phone` moves into the same table unchanged. All regexes are compiled from string literals
— declarative, never eval. Mirrors the form-relevant subset of Formily's validator
registry.
