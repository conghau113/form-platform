---
"@org/form-renderer-web": minor
---

Imperative modal/drawer forms + table row editing in a dialog (Phase H).

- `openFormDialog(schema, opts?)` / `openFormDrawer(schema, opts?)` →
  `Promise<values | undefined>`: mount a `FormRenderer` in an antd Modal/Drawer on a
  detached root and await the result. OK (after a valid submit) resolves the clean typed
  values; cancel/close resolves `undefined`; a failed validation leaves the popup open.
  `opts` forwards `theme`/`initialValues`/`access` to the form and `title`/`okText`/
  `cancelText`/`width` (+ `placement`/`height` for the drawer) to the chrome. antd stays a
  peerDependency.
- `FormRenderer` is now wrapped in `forwardRef` exposing `FormRendererHandle.submit()`, and
  gains an additive `hideSubmit` prop. Without the new props its runtime output is unchanged.
- Table arrays gain optional **row editing in a dialog** (`array.editInDialog`, table
  variant only): rows render read-only and an Edit button opens that row's `itemFields` via
  `openFormDialog`, writing the result back on OK.
