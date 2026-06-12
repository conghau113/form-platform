---
"@org/form-core": minor
---

Validate the Phase L field types in `buildZodSchema`/`leafZod`:

- `checkbox-group` — an array of option values; `required` ⇒ at least one selection.
- `upload` — the antd fileList as a plain array (`z.array(z.any())`, so live local files
  never fail); `required` ⇒ ≥1 file, `maxCount` bounds the upper end.

Both flow through the existing reaction-`required` override and array-row paths, so
validation stays consistent with what the renderer shows.
