---
"@org/form-schema": minor
---

Expand the validation-rule `format` enum (X8). Adds `integer`, `number`, `money`,
`idcard`, `zh`, `en`, `qq` and `zip` alongside the existing `email`/`url`/`phone`. Pure
additive widening of an optional enum — old JSON keeps parsing → no `CURRENT_FORM_VERSION`
bump. Each value maps to a fixed regex (or a Zod built-in) in form-core; the JSON never
carries a function (no eval).
