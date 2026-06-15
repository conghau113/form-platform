---
"@org/form-schema": minor
---

Add the `Preset` authoring model (Builder UX v2, Track P / P1).

`form-schema` gains a `Preset` type (`{ id, fieldType, name, icon?, patch }`), a
`presetSchema` zod validator, and a `parsePreset` helper. A preset is a named, reusable
field template — a schema `fieldType` plus an opaque `patch` of default props (and an
optional icon token) that the builder applies when seeding a field.

A preset is **authoring metadata, not form JSON**: it is decoupled from
`CURRENT_FORM_VERSION`, so this addition needs no formVersion bump and no migration. The
`apps/api` preset store and the builder consume this single shared definition; `patch` is
opaque declarative data and is never evaluated.
