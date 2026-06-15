---
"@org/form-renderer-web": minor
---

Phase X7: the web renderer now honours the cross-cutting decorator extras. Each leaf's
`Form.Item` threads `extra` (a persistent hint shown under the control, never replaced by
a validation message) and `hasFeedback` (the antd status icon). Both are suppressed in
table-cell `bare`/`hideLabel` mode and can still be overridden per-field via
`decoratorProps`. Additive — forms without the props render unchanged.
