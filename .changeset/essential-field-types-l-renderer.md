---
"@org/form-renderer-web": minor
---

Render the Phase L field types + rich props:

- `upload` — an antd `Upload` whose value is the fileList. By default `beforeUpload → false`
  keeps each file local (no server call); a real upload happens only when the form's
  `settings.submitUrl` is set (used as the `action`). Honors `accept`/`maxCount`/`listType`.
- `checkbox-group` — an antd `Checkbox.Group`; options come from static `options`, a remote
  `dataSource`, or a reaction `options` effect. The dataSource fetch is shared with `select`
  via a new `useRemoteOptions` hook.
- `number` honors `step`/`precision`; `select` honors `showSearch`/`allowClear` and `tags`
  mode (tags wins over `multiple`).
- `readPretty`/`readOnly` preview both new types (checkbox-group → option labels, upload →
  file names). Array-valued leaves (checkbox-group/upload) seed `[]` so a `required` rule
  surfaces its custom message.
