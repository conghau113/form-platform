---
"@org/form-schema": minor
---

Phase N validation depth (all additive → old JSON parses → no `CURRENT_FORM_VERSION` bump):

- `validationRuleSchema` gains `severity?: "error"|"warning"` (warning never blocks submit)
  and a `cross` rule type whose `rule` is a SAFE JSONLogic assertion (must evaluate TRUE
  for the field to be valid; merged row scope inside arrays).
- `asyncValidator?: { url, message?, debounceMs? }` on `commonFields` — debounced remote
  check, GET `url?value=<v>&name=<field>` → `{ valid, message? }`; `valid:false` blocks,
  network failure fails open.
- `settings.validateTrigger?: "onInput"|"onBlur"|"onSubmit"` — when the renderer validates
  (maps to react-hook-form `mode`).
