---
"@org/form-renderer-web": minor
---

Design-mode rendering hooks for the WYSIWYG builder canvas (Phase E1).

`FormRenderer` gains two optional, additive props. `nodeWrapper(rendered, { node, path })`
wraps every authorable node's output (e.g. in a selection shell carrying
`data-designer-node-id`); `path` is the node's positional route (indices into `fields`,
then each container's `children`) and is stable across `migrate()`, so a designer can map
it back to its tree node. Array `itemFields` are intentionally not walked (rows aren't
authored on the canvas). `designMode` makes leaf controls pointer-inert — fully visible
but click-through, unlike `disabled`, so the canvas looks identical to runtime — and hides
the Submit button. Tab/collapse panes now map with their original index before the
visibility filter, so a hidden pane never shifts a sibling's path.

Both default off; with neither prop set the runtime render is byte-for-byte unchanged.
`NodeWrapperContext` is exported.
