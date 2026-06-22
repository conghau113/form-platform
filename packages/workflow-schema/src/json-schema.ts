import { zodToJsonSchema } from "zod-to-json-schema";
import { CURRENT_WORKFLOW_VERSION, workflowDefinitionSchema } from "./schema.js";

/**
 * P0 — open compile target for the workflow contract (mirrors form-schema's
 * `json-schema.ts`). Emit the workflow DEFINITION as a standalone JSON Schema
 * (draft-07) so an external tool or LLM can validate / author a
 * `WorkflowDefinition` WITHOUT importing Zod. `workflowDefinitionSchema` stays
 * the single source of truth; this is a derived projection of it.
 */

/** Base URI for the published schema, versioned by `workflowVersion`. Swap for
 *  the public HTTP URL when hosted (P0 "publish at a stable URL"). */
export const WORKFLOW_SCHEMA_URI_BASE = "urn:form-platform:workflow" as const;

/** Stable, version-pinned identifier for the current workflow JSON Schema. */
export const WORKFLOW_SCHEMA_ID =
  `${WORKFLOW_SCHEMA_URI_BASE}:v${CURRENT_WORKFLOW_VERSION}` as const;

/** Build the JSON Schema for the current workflow definition contract. */
export function buildWorkflowJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(workflowDefinitionSchema, {
    name: "WorkflowDefinition",
    $refStrategy: "root",
    target: "jsonSchema7",
    definitionPath: "$defs",
    basePath: [WORKFLOW_SCHEMA_ID],
  }) as Record<string, unknown>;
}

/** The current workflow contract as JSON Schema (draft-07), computed once. */
export const WORKFLOW_JSON_SCHEMA: Record<string, unknown> = {
  $id: WORKFLOW_SCHEMA_ID,
  ...buildWorkflowJsonSchema(),
};
