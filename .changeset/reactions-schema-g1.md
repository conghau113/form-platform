---
"@org/form-schema": minor
---

Add optional field-level `reactions[]` (linkage), Phase G1.

Every leaf field gains an optional `reactions: Reaction[]`, where a `Reaction` is
`{ when: { rule }, target: string, effect: "visible" | "disabled" | "value" | "options",
value? }`. `when` reuses `conditionSchema` (the same SAFE JSONLogic shape and evaluator as
`visibleWhen`), so reactions are never `eval`'d. A reaction makes the named `target`
react to other fields' values: show/hide, enable/disable, set value, or swap options while
`when` is true. The change is purely additive — existing JSON without the key still parses,
so `CURRENT_FORM_VERSION` is not bumped (same precedent as `validations[]`). The form-core
engine and renderer wiring land in later G sub-phases.
