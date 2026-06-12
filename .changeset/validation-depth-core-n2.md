---
"@org/form-core": minor
---

Phase N validation runtime:

- The blocking Zod schema now sees only error-severity, non-cross rules (single filter
  point in `leafZod`; the shared `leafZodWith` core keeps the error and warning paths
  from drifting). A warning-severity `required` rule no longer derives requiredness.
- `cross` rules: field-level superRefine evaluating the rule's SAFE JSONLogic assertion
  against the build scope — merged `{...outer, ...row}` inside array rows, with issues
  landing on the field's own path.
- New `collectWarnings(form, values, access?)` — dotted-path map of non-blocking warning
  messages, honoring the exact visibility/RBAC walk of the blocking schema.
- New `collectAsyncFields(form, values, access?)` + `async-validator.ts`
  (`buildAsyncValidatorUrl`, `checkAsyncValidator` with injectable fetch) — the
  platform-agnostic half of the debounced remote check protocol
  (`?value=&name=` → `{ valid, message? }`).
