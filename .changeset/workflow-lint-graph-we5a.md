---
"@org/workflow-core": minor
---

Add `lintGraph` — advisory (non-blocking) structural checks for a workflow definition, returning
`GraphWarning[]` with codes `dead-end` (a start/normal node with no outgoing transition) and
`end-has-outgoing` (a `kind: "end"` node that still leads somewhere).

Kept deliberately SEPARATE from the hard `validateGraph` gate: the editor's save-block and the AI
`normalizeWorkflowDraft` → repair loop treat every `validateGraph` error as fatal, so these
"runnable but probably a mistake" findings live in their own function. `validateGraph` is unchanged;
the AI moat and eval graph-valid-rate are unaffected. The builder surfaces warnings as an amber ring
plus an advisory panel section that never blocks save. Single-node drafts are not flagged.
