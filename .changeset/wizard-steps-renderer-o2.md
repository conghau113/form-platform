---
"@org/form-renderer-web": minor
---

Render the `steps` multi-step wizard (Phase O). A new `StepsSection` shows one `step` pane
at a time with a Prev/Next footer over an antd `Steps` header; every pane stays mounted
(inactive ones hidden) so react-hook-form Controllers register, mirroring tabs' `forceRender`.
Next validates only the current step's fields (`trigger`), Submit appears on the last step
only, and the global Submit row is suppressed whenever a `steps` node owns submission. A
failed submit jumps back to the first step with an error. Additive — forms without `steps`
render byte-for-byte as before.
