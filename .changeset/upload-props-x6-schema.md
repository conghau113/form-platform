---
"@org/form-schema": minor
---

Phase X6 — Upload field gains `multiple?`, `directory?`, and `dragger?` (all optional →
old JSON parses → no `CURRENT_FORM_VERSION` bump). `multiple` allows several files per
pick, `directory` uploads a whole folder, `dragger` selects the large drop‑zone variant.
All web-only; the native renderer ignores them.
