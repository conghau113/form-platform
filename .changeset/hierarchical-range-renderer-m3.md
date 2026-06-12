---
"@org/form-renderer-web": minor
---

Phase M controls:

- `cascader` → antd Cascader and `tree-select` → antd TreeSelect (explicit `fieldNames`
  maps the contract's `label` onto TreeSelect's display field). Both reuse
  `useRemoteOptions`, so static trees, remote trees (`dataSource.childrenKey`) and
  reaction `options` overrides all work, with dependency gating.
- `date-range` → DatePicker.RangePicker and `time-range` → TimePicker.RangePicker;
  the `[start, end]` dayjs tuple stays raw in form state (like `date`). `picker`
  variant pass-through on `date` and `date-range`.
- readPretty previews: cascader path joined `" / "`, tree-select labels resolved
  anywhere in the tree, ranges as `"start ~ end"`.
- `schemaDefaults` seeds `[]` for cascader and multiple tree-select so a `required`
  rule surfaces its custom min(1) message.
