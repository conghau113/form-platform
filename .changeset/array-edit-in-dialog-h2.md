---
"@org/form-schema": minor
---

Add optional `array.editInDialog` (Phase H). When set on a table-variant array node, the
renderer makes rows read-only and edits them in a popup form instead of inline. Additive
optional prop → old JSON still parses → no `CURRENT_FORM_VERSION` bump.
