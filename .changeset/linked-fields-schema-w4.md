---
"@org/form-schema": minor
---

Add optional `presetId` + `overrides` to every field (Track W4 — linked fields). A field can
reference a reusable preset by id; `overrides` records per-instance tweaks layered on the
preset's `patch`. Both are additive optional props (same character as `validations`/`reactions`)
→ old JSON still parses → no `CURRENT_FORM_VERSION` bump.
