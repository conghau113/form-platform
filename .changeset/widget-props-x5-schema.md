---
"@org/form-schema": minor
---

Add optional widget props (X5). `switch` gains `checkedChildren`/`unCheckedChildren` and an
antd-specific `size` (`default`/`small`); `slider` gains `range`/`vertical`/`dots`; `rate`
gains a named `character` preset (`star`/`heart`/`like`) and `allowClear`. All declarative
(no functions/`eval`) and additive optional props → old JSON still parses → no
`CURRENT_FORM_VERSION` bump. Slider `marks` and a tooltip formatter are deferred (they need
a new key/value setter the property panel does not yet carry).
