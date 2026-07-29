---
"@org/form-schema": minor
"@org/form-core": minor
"@org/form-renderer-web": minor
---

Add the `lookup` field type: a record picker that opens a modal, lists records from a
`dataSource`, and on Apply stores the picked record's `valueKey` while filling SEVERAL
other fields from the same record via `mapping` (response key -> target field name).

- `form-schema`: `lookupFieldSchema` (+ `lookupColumnSchema` / `lookupMappingSchema`) and a
  capability entry. Purely additive — old documents keep parsing, so `CURRENT_FORM_VERSION`
  stays at 3 and no migration is needed.
- `form-core`: `fetchDataSourceRows` (raw rows, every key kept — `fetchDataSourceOptions`
  now builds on it) plus a pure `lookup` module (`lookupColumns`, `lookupPatch`,
  `filterLookupRows`) and the `lookup` validation arm.
- `form-renderer-web`: `LookupControl` (antd Modal + Table, lazy fetch on open, client-side
  filtering) and a multi-field write path — a control can now assign several sibling fields
  in one pass, scoped to its array row when nested.
