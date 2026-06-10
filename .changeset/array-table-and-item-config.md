---
"@org/form-schema": minor
"@org/form-renderer-web": minor
---

Form List parity with antd: table variant + full item-field configuration.

`form-schema` adds an optional `variant?: "card" | "table"` to the `array` node. Purely
additive — JSON without it parses and renders as cards, so `CURRENT_FORM_VERSION` is not
bumped.

`form-renderer-web` renders the table variant as an antd `Table` (one column per item
field, label-less full-width cells, an actions column with reorder/remove, and an Add
button below); the card variant is unchanged. `renderNode` gained `hideLabel`/`bare`
options so a control can render inside a table cell without its own label or `Col` wrapper.

The builder now lets you **fully configure** each item field instead of only editing
type/label/name: the PropertyPanel is recursive with a drill path — clicking **Configure**
on an item opens the same full editor (options, validations, default value, layout,
visibility…) for that item, with a breadcrumb to return; nested arrays drill deeper. The
array's section also has a **Display: Cards / Table** toggle that sets `variant`. New pure
helpers `nodeAtPath`/`patchNodeAtPath` rebuild a single top-level patch from a nested edit,
so the editor↔schema boundary is unchanged.
