---
"@org/workflow-schema": minor
---

Add optional `i18n` localization overrides to the workflow contract (WF4b), mirroring
form-schema. A node may carry `i18n` (`attribute → locale → string`) for its `status` label, a
transition for its action display LABEL (under the `action` attribute — `action` itself stays the
engine identifier), and the definition for its `title`, plus definition-level `defaultLocale` and
`locales` (the declared switcher list). All additive/optional ⇒ old JSON keeps parsing, so NO
`workflowVersion` bump. The capability catalog lists the new optional keys. `localizeWorkflow` in
workflow-core resolves these for display.
