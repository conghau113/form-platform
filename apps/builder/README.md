# @app/builder (hosted once)

This is the drag-and-drop **builder app** — deployed in ONE place (internal admin),
always on the latest version. Projects never install it; they only install a
renderer. The builder's only job is to PRODUCE versioned JSON and write it to the DB.

Suggested stack:
- Vite + React + TypeScript + antd
- dnd-kit (drag & drop) or Craft.js / Puck for the canvas
- @org/form-renderer-web for the live preview pane (with a desktop/tablet/mobile
  viewport toggle; optionally react-native-web to preview the native renderer)
- A Theme Editor screen that edits an antd ThemeConfig token object live via
  <ConfigProvider theme={...}> and exports it as JSON alongside the form schema.

Output of this app: `{ formVersion, id, title, fields, settings }` + a theme token
JSON. Both get stored by the backend.
