---
"@org/form-schema": minor
---

Add optional rich input + choice props (X2/X3). Input family: `text` gains
`allowClear`/`showCount`/`prefix`/`suffix`/`addonBefore`/`addonAfter`/`size`/`variant`;
`textarea` gains `allowClear`/`showCount`/`autoSize` (boolean or `{minRows,maxRows}`)/`size`;
`password` gains `allowClear`/`size`/`variant`; `number` gains
`prefix`/`addonBefore`/`addonAfter`/`controls`/`keyboard`/`displayFormat`
(thousands|currency|percent declarative preset, never a function)/`currency`/`size`/`variant`.
Choice family: `select` gains `placeholder`/`maxTagCount`/`size`/`variant`; `radio` gains
`optionType`/`buttonStyle`/`size`; `checkbox-group` gains `direction`. All additive optional
props → old JSON still parses → no `CURRENT_FORM_VERSION` bump.
