import { fieldNodeSchema } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { FIELD_TYPES } from "./field-registry";
import { newField } from "./model";

describe("field registry", () => {
  it("every registered type seeds a field the contract accepts", () => {
    for (const type of FIELD_TYPES) {
      const field = newField(type);
      expect(() => fieldNodeSchema.parse(field), `type ${type}`).not.toThrow();
    }
  });

  it("seeds unique, non-empty names and the registry label", () => {
    const taken = new Set<string>();
    for (const type of FIELD_TYPES) {
      const field = newField(type, taken);
      expect(field.name).toBeTruthy();
      expect(taken.has(field.name)).toBe(false);
      taken.add(field.name);
    }
  });
});
