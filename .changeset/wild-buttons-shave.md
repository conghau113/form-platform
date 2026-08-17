---
"@org/workflow-schema": minor
"@org/workflow-core": minor
---

E1 — per-node execution trace.

`workflowNodeSchema` gains an optional `defaultAssignee` (`{kind: "role" | "user", value}`): who a
state is EXPECTED to land on, as authored on the template. It is a suggestion, never a permission —
the engine never consults it, and `transition.role` remains the only thing it checks the actor
against.

workflow-core gains the pure `nodeProgress(def, instance)`, which projects an instance's
transition-keyed `history` onto the definition's nodes. Each node reports `pending`, `active`, or
`done` — and `done` carries the time, action and actor of the LAST departure from that node (a
discriminated union: those three arrive together or not at all). No clock, no I/O, no input
mutation, so the frontend and the backend can both call it.

**`CURRENT_WORKFLOW_VERSION` is NOT bumped.** Both additions are optional, so every saved definition
keeps parsing unchanged and no migration is needed — the same character as `i18n` / `statusCode` /
`kind` / `actor`.
