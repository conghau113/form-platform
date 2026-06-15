---
"@org/form-renderer-web": minor
---

Render the X5 widget props. `FieldControl` maps the new props onto antd's `Switch`
(`checkedChildren`/`unCheckedChildren`/`size`), `Slider` (`range` two-handle value,
`vertical`, `dots`), and `Rate` (`allowClear` plus a `character` preset resolved to a
default star or a plain text glyph — no icon import). All declarative; additive — older
schemas render unchanged.
