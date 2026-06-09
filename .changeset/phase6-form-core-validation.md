---
"@org/form-core": minor
---

Add `buildZodSchema(form, { values, access })`: a cross-platform helper that derives a Zod
schema from a `FormSchema`, honoring `required`, number `min`/`max`, and text `maxLength`.
Fields hidden by `visibleWhen` (and, when `access` is supplied, by RBAC) are excluded from
validation and stripped from the parsed output; group children are flattened into the value
object. Reusable by every renderer so validation behaves identically on web and native.
