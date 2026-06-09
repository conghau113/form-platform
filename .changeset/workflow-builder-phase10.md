---
"@org/workflow-schema": minor
"@org/workflow-core": minor
---

Add the workflow expansion on top of forms. `@org/workflow-schema` is a versioned
contract (`workflowVersion` + `migrateWorkflow`) for a workflow **definition**
(nodes with a bound `formId`, transitions with a JSONLogic `guard`, `role` and
`action`) and a running **instance** (pins its `definitionVersion`, tracks current
state + history). `@org/workflow-core` is a pure-TS engine — `createInstance`,
`availableTransitions`, `advance` (evaluates guards via SAFE JSONLogic + roles,
returns a new instance, never mutates) and `validateGraph` (one start, no
dangling transitions, all nodes reachable) — that runs identically on the
frontend and a NestJS backend. The builder gains an `@xyflow/react` workflow
editor (mode toggle alongside the form builder) that authors the graph, binds a
form per node, validates it, and exports the definition as JSON.
