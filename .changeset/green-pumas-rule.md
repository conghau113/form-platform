---
"@org/form-renderer-web": patch
---

Add an optional `initialValues` prop to `FormRenderer` (seeds the form's values, e.g. when
editing an existing submission and to drive conditional visibility). Add a Vitest +
@testing-library/react suite that renders the `examples/form.v1.json` fixture and verifies the
`visibleWhen` conditional shows only when `country === "OTHER"` and the admin-only field is
hidden when `access.roles` is empty.
