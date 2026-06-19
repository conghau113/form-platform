---
"@org/form-schema": minor
"@org/form-renderer-web": minor
---

Add a `form-layout` container (R7): a value-transparent layout region (like `group`, but
nameless) that applies an antd `Form` label layout to every descendant `Form.Item` — so an
author can switch a whole region to horizontal/inline labels (with optional `labelCol`/
`wrapperCol`/`labelAlign`/`colon`) without editing each field. The orientation lives under
`formLayout` to avoid colliding with the responsive `layout` (colSpan) every container shares.

The web renderer adds a dedicated `form-layout` branch that provides a `LayoutContext`;
each leaf's `Form.Item` reads it (a field's own `decoratorProps` still win, and "inline"
maps to a per-item horizontal label since antd's item-level layout is horizontal/vertical
only). It joins `isLayoutContainer`, so form-core's `buildShape`/`walkLeaves` and the
renderer's default/step helpers descend it transparently with no further change. The native
single-column renderer ignores the label props. Additive ⇒ no `formVersion` bump (old JSON
keeps parsing).
