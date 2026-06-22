import { zodToJsonSchema } from "zod-to-json-schema";
import { CURRENT_FORM_VERSION, formSchema } from "./schema.js";

/**
 * P0 — open compile target.
 *
 * Emit the form contract as a standalone JSON Schema (draft-07) so an external
 * tool or LLM can validate / author a `FormSchema` WITHOUT importing Zod or this
 * package. `formSchema` (Zod) stays the single source of truth — this is a
 * derived, machine-readable projection of it, not a second contract.
 *
 * The renderer/runtime still validates with Zod (`formSchema.parse`); this
 * artifact is for the *authoring* side (agents, MCP tools, editor tooling).
 */

/**
 * Base URI for the published schema. Versioned by `formVersion`, not the npm
 * package version (the JSON shape is what `$id` identifies). Swap this for the
 * public HTTP URL when the schema is hosted (P0 "publish at a stable URL").
 */
export const FORM_SCHEMA_URI_BASE = "urn:form-platform:form" as const;

/** Stable, version-pinned identifier for the current form JSON Schema. */
export const FORM_SCHEMA_ID = `${FORM_SCHEMA_URI_BASE}:v${CURRENT_FORM_VERSION}` as const;

/**
 * Build the JSON Schema for the current form contract. Deterministic: same Zod
 * schema in, same JSON out, so the result can be snapshot-tested and published.
 */
export function buildFormJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(formSchema, {
    name: "FormSchema",
    $refStrategy: "root",
    target: "jsonSchema7",
    definitionPath: "$defs",
    basePath: [FORM_SCHEMA_ID],
  }) as Record<string, unknown>;
}

/** The current form contract as JSON Schema (draft-07), computed once. */
export const FORM_JSON_SCHEMA: Record<string, unknown> = {
  $id: FORM_SCHEMA_ID,
  ...buildFormJsonSchema(),
};
