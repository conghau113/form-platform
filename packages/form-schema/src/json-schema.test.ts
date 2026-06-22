import { describe, expect, it } from "vitest";
import { buildFormJsonSchema, FORM_JSON_SCHEMA, FORM_SCHEMA_ID } from "./json-schema.js";

// biome-ignore lint/suspicious/noExplicitAny: JSON Schema is an open record.
const defs = (s: any): Record<string, any> => s.$defs ?? {};

describe("form JSON Schema export", () => {
  it("is stamped with the version-pinned $id", () => {
    expect(FORM_SCHEMA_ID).toBe("urn:form-platform:form:v3");
    expect(FORM_JSON_SCHEMA.$id).toBe(FORM_SCHEMA_ID);
  });

  it("is deterministic", () => {
    expect(buildFormJsonSchema()).toEqual(buildFormJsonSchema());
  });

  it("is plain serializable JSON (no functions, no cycles)", () => {
    expect(() => JSON.stringify(FORM_JSON_SCHEMA)).not.toThrow();
  });

  it("exposes the form's required top-level fields", () => {
    const form = defs(FORM_JSON_SCHEMA).FormSchema;
    expect(form).toBeDefined();
    expect(form.type).toBe("object");
    for (const key of ["formVersion", "id", "title", "fields"]) {
      expect(form.properties).toHaveProperty(key);
      expect(form.required).toContain(key);
    }
  });

  it("captures the recursive contract via $ref (not inlined cycles)", () => {
    // The root form lives under $defs and recursive nodes resolve via $ref back
    // into it, so the document stays finite despite the self-referential union.
    expect(defs(FORM_JSON_SCHEMA)).toHaveProperty("FormSchema");
    expect(FORM_JSON_SCHEMA.$ref).toBe(`${FORM_SCHEMA_ID}/$defs/FormSchema`);
    const refs = JSON.stringify(FORM_JSON_SCHEMA).match(/"\$ref":/g) ?? [];
    expect(refs.length).toBeGreaterThan(1);
  });
});
