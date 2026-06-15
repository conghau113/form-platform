---
"@org/form-renderer-web": minor
---

Render the X2/X3 rich input + choice props. `FieldControl` maps the new text/textarea/
password/number props onto antd (allowClear, showCount, prefix/suffix/addons, autoSize,
controls/keyboard, size/variant); a new `numberFormatProps` helper turns the declarative
`displayFormat` preset (`thousands`/`currency`/`percent` + `currency` code) into antd
formatter/parser functions — selected by enum, never eval'd. `SelectControl` honors
`placeholder`/`maxTagCount`/`size`/`variant`; `radio` honors `optionType`/`buttonStyle`/
`size`; `CheckboxGroupControl` stacks vertically when `direction = "vertical"`. Additive —
older schemas render unchanged.
