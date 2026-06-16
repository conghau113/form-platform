---
"@org/form-schema": patch
---

Add optional `scope` (`"global" | "project"`) and `projectId` to the `Preset` authoring
model (Track W3). A `"project"` preset must carry a `projectId`; absent `scope` ⇒ global.
Presets are organisational metadata, not form JSON — this is additive and decoupled from
`CURRENT_FORM_VERSION` (no bump, no migration). Old preset bodies keep parsing.
