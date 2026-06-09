---
"@org/form-renderer-web": minor
---

Replace `FormRenderer`'s manual `useState` with `react-hook-form` + `@hookform/resolvers/zod`,
validating against `buildZodSchema` from `@org/form-core`. The resolver rebuilds per validation
so hidden (`visibleWhen=false`) and non-viewable fields are excluded; `onSubmit` now emits a
clean, typed values object (hidden keys stripped). Adds a submit button (`submitLabel`) and a
`textarea` control. Tests cover a required field blocking submit and a hidden field not being
validated.
