---
"@org/workflow-ai": minor
---

Add `@org/workflow-ai` — natural-language → guaranteed-valid `WorkflowDefinition`
(P3 / Track C, phase C1; the moat). Built on `@org/ai-core`'s shared
generate→validate→repair loop; deps are `@org/ai-core`, `@org/workflow-schema`,
`@org/workflow-core`, `zod` (no react/antd; server + browser).

- `normalizeWorkflowDraft` — the moat in one gate: stamp version → migrate → Zod
  parse (shape) → `validateGraph` (reachability / no dangling edges / single
  start). Both gates report into one error channel, so the shared loop feeds
  graph problems back to the model exactly like Zod problems — no loop changes.
- `generateWorkflow(provider, { prompt })` / `refineWorkflow(provider, { currentWorkflow,
  instruction })` — bounded repair, result is a definition that is parse-valid AND
  graph-valid, or structured errors. No eval; guards stay JSONLogic.
- `prompt.ts` embeds the live `workflowCapabilities()` primitive catalog so the
  model authors against the contract without seeing Zod.
