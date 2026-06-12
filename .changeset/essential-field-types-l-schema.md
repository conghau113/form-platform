---
"@org/form-schema": minor
---

Add the Phase L essential field types + rich props to the contract. Additive → old JSON
still parses → no `CURRENT_FORM_VERSION` bump.

- `upload` — a file-attachment leaf (`accept?`, `maxCount?`, `listType?`). Its value is an
  array of file metadata (`uploadFileSchema` = the serializable subset of antd's
  `UploadFile`: `uid`, `name`, `url?`, `status?`).
- `checkbox-group` — a multi-select rendered as checkboxes; reuses select's `options` /
  `dataSource` shapes (static or remote), value is an array of the chosen option values.
- `number` gains `step?` and `precision?`.
- `select` gains `tags?` (free-tagging mode), `showSearch?` and `allowClear?`.

Both new leaves join the `LeafField` union and `fieldNodeSchema`.
