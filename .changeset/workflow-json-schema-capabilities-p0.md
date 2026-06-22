---
"@org/workflow-schema": minor
---

Add the open compile target for the workflow contract (AI-agent-native P0,
mirrors `@org/form-schema`). Two derived, machine-readable projections of the
existing Zod contract — neither changes the contract or `CURRENT_WORKFLOW_VERSION`:

- `json-schema.ts`: `buildWorkflowJsonSchema()` / `WORKFLOW_JSON_SCHEMA` emit the
  workflow definition as a standalone JSON Schema (draft-07) with a version-pinned
  `$id` (`WORKFLOW_SCHEMA_ID`). Adds a `zod-to-json-schema` dependency.
- `capabilities.ts`: `WORKFLOW_PRIMITIVES` / `workflowCapabilities()` — a catalog
  of the node/transition/guard primitives + definition shape for agent discovery,
  guarded by a drift test that derives the key sets from the Zod schemas.
