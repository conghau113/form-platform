---
"@org/form-schema": minor
---

Add `steps` / `step` layout containers (Phase O — multi-step wizard). `steps` is a
value-transparent container whose children are `step` panes (Zod enforces step-only
children, mirroring tabs/tab-pane); `step` carries a required `label` and an optional
`description`. New optional node types are additive — old JSON still parses → no
`CURRENT_FORM_VERSION` bump.
