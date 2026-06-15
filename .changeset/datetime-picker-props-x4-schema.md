---
"@org/form-schema": minor
---

Add optional date/time picker props (X4). `date` and `date-range` gain
`format` (dayjs token string)/`showTime`/`allowClear`/`size`/`variant`; `time` and
`time-range` gain `format`/`use12Hours`/`minuteStep`/`allowClear`/`size`/`variant`. All
declarative values (no functions/`eval`) and additive optional props → old JSON still
parses → no `CURRENT_FORM_VERSION` bump. `minDate`/`maxDate` bounds are deferred (they need
a date-library parse the renderer doesn't yet carry).
