---
"@org/form-schema": minor
---

Phase X7 cross-cutting decorator extras on `commonFields` (additive → old JSON parses →
no `CURRENT_FORM_VERSION` bump). Every leaf field now accepts:

- `extra?: string` — a persistent secondary hint rendered under the control (antd
  `Form.Item` `extra`). Unlike `helpText` (antd `help`), a validation message never
  replaces it. Web-only; the native renderer ignores it.
- `hasFeedback?: boolean` — show antd `Form.Item`'s feedback status icon. Web-only.

(`size`/`variant` already live per-field from X2–X5; X7 completes the cross-cutting story
with the decorator-level extras.)
