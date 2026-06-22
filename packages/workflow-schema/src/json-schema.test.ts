import { describe, expect, it } from "vitest";
import {
  buildWorkflowJsonSchema,
  WORKFLOW_JSON_SCHEMA,
  WORKFLOW_SCHEMA_ID,
} from "./json-schema.js";

// biome-ignore lint/suspicious/noExplicitAny: JSON Schema is an open record.
const defs = (s: any): Record<string, any> => s.$defs ?? {};

describe("workflow JSON Schema export", () => {
  it("is stamped with the version-pinned $id", () => {
    expect(WORKFLOW_SCHEMA_ID).toBe("urn:form-platform:workflow:v1");
    expect(WORKFLOW_JSON_SCHEMA.$id).toBe(WORKFLOW_SCHEMA_ID);
  });

  it("is deterministic and plain serializable JSON", () => {
    expect(buildWorkflowJsonSchema()).toEqual(buildWorkflowJsonSchema());
    expect(() => JSON.stringify(WORKFLOW_JSON_SCHEMA)).not.toThrow();
  });

  it("exposes the definition's required top-level fields", () => {
    const def = defs(WORKFLOW_JSON_SCHEMA).WorkflowDefinition;
    expect(def).toBeDefined();
    expect(def.type).toBe("object");
    for (const key of ["workflowVersion", "id", "title", "start", "nodes", "transitions"]) {
      expect(def.properties).toHaveProperty(key);
      expect(def.required).toContain(key);
    }
  });
});
