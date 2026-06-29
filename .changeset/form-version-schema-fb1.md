---
"@org/form-schema": minor
---

Add `FormVersion` contract (Track FB1) — an immutable published snapshot of a form. Like
`Submission`/`Preset`, it is runtime/governance data decoupled from `CURRENT_FORM_VERSION` (no
form migration to grow it). The form's editable working copy stays the mutable draft; publishing
freezes the current draft into a numbered (`version`, 1-based per form), immutable `FormVersion`
so runtime (submission) can prefer the active published version and later draft edits never change
how a published form is submitted/validated. `formVersionSchema` / `parseFormVersion` validate the
envelope (`body` is validated as a full `FormSchema`; `version`/`formVersion` are integers).
