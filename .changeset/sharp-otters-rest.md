---
"@org/form-schema": patch
---

Add a regression test that loads the saved `examples/form.v1.json` fixture and asserts
`migrate()` brings it up to `CURRENT_FORM_VERSION`, guarding the "never break older saved
JSON" contract against the real persisted document.
