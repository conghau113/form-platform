---
"@org/form-core": minor
---

Add `maskData(form, data, access)` (Track FS2) — a pure helper that returns a copy of a form's
answer data with every field the actor cannot VIEW removed (field-level RBAC via
`permissions.viewRoles`). It mirrors `buildZodSchema`'s traversal exactly (transparent layout
containers flatten into the parent scope, array rows are masked per-row), so the fields excluded
from the validation shape are the same ones masked here. Used server-side so submission reads never
leak role-gated answers regardless of the client. Empty/undefined `viewRoles` ⇒ visible to everyone;
never mutates the input.
