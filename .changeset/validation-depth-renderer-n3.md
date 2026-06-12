---
"@org/form-renderer-web": minor
---

Phase N validation depth in the web renderer:

- `settings.validateTrigger` maps to react-hook-form's mode — onInput→onChange,
  onBlur→onBlur (a boxless display:contents wrapper threads `field.onBlur`, rendered
  only under that trigger), absent → unchanged on-submit behavior.
- Warning-severity rules render antd `validateStatus="warning"` + help text via
  `collectWarnings` (dotted paths cover array rows); an error always wins the slot
  and warnings never block submit.
- `asyncValidator` runs through an async resolver layer after the Zod pass:
  per-value memoized + debounced (default 400ms, supersede-on-keystroke), skipped
  when the field already has a Zod error or is empty; `valid:false` blocks submit
  with the server (or configured) message; network failure fails OPEN.
