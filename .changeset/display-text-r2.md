---
"@org/form-schema": minor
"@org/form-core": minor
"@org/form-renderer-web": minor
---

Add a `display-text` field type (R2): a static, value-LESS display node for authored
content (headings, paragraphs, notes). It carries `content` + optional `variant`
(`title`/`paragraph`/`text`), `level` (1–5 for titles) and `align`, but no `name` and no
value — it never contributes to the submitted object or to validation. The web renderer
maps it to antd `Typography.*` (no `Form.Item` wrapper); form-core's `buildShape`/
`walkLeaves` skip it as value-less. Additive ⇒ no `formVersion` bump (old JSON keeps
parsing).
