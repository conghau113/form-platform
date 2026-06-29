---
"@org/form-schema": minor
---

Add `Submission` contract (Track FS1) — a recorded answer to a form. Like `Preset`, it is
runtime data decoupled from `CURRENT_FORM_VERSION` (no form migration to grow it). It pins a
`schemaSnapshot` (the migrated `FormSchema` the data was validated against) so later edits to a
form never change how an old submission reads or re-validates. `submissionSchema` /
`parseSubmission` validate the envelope (snapshot is validated as a full form; `data` stays
opaque — its contents are validated against the snapshot by `@org/form-core`, server-side).
