---
"@org/form-renderer-web": minor
---

Render the X4 date/time picker props. `FieldControl` maps the new props onto antd's
`DatePicker`/`RangePicker` (`format`/`showTime`/`allowClear`/`size`/`variant`) and
`TimePicker`/`TimePicker.RangePicker` (`format`/`use12Hours`/`minuteStep`/`allowClear`/
`size`/`variant`). All values are declarative — `format` is a dayjs token string passed
straight through, never eval'd. Additive — older schemas render unchanged.
