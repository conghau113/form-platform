---
"@org/form-schema": minor
"@org/form-core": minor
"@org/form-renderer-web": minor
---

Expand the field library (Phase A) and add shared common props.

`form-schema` gains seven additive leaf types — `radio`, `switch`, `slider`, `rate`,
`password`, `time`, `color` — plus three optional common props on every field:
`tooltip`, `disabled` and `defaultValue`. All changes are purely additive: existing v3
JSON parses and renders unchanged, so `CURRENT_FORM_VERSION` is not bumped (same
precedent as adding `textarea`). New schema + migration-safety tests cover the additions.

`form-core` maps the new types in `buildZodSchema`: `radio` validates like a single
`select`, `switch` like `checkbox` (a required switch must be on), `slider` honors
min/max, `rate` and `color` assert presence when required, `password` honors `maxLength`,
and `time` is treated like `date` (platform-specific value shape). Tests cover the new
types.

`form-renderer-web` renders the new controls (antd `Radio.Group`, `Switch`, `Slider`,
`Rate`, `Input.Password`, `TimePicker`, `ColorPicker`), shows `tooltip` on the form item,
applies `disabled`, and seeds each field's `defaultValue` into the form (explicit
`initialValues` still win).
