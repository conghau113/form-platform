import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import {
  CONTAINER_FIELD_TYPES,
  capabilityOf,
  FIELD_CAPABILITIES,
  FIELD_TYPES,
  formCapabilities,
} from "./capabilities.js";
import { LAYOUT_CONTAINER_TYPES } from "./containers.js";
import { CURRENT_FORM_VERSION, fieldNodeSchema } from "./schema.js";

/**
 * Derive the set of `type` discriminator literals straight from the Zod union so
 * the catalog cannot silently drift from the contract. Reaches into Zod 3
 * internals (stable for this pinned version); test-only.
 */
function discriminatorsOf(schema: ZodType): Set<string> {
  // biome-ignore lint/suspicious/noExplicitAny: Zod internal walk.
  const unwrap = (s: any): any => {
    while (s?._def?.typeName === "ZodLazy") s = s._def.getter();
    return s;
  };
  const union = unwrap(schema);
  // biome-ignore lint/suspicious/noExplicitAny: Zod internal walk.
  const options: any[] = union._def.options;
  const out = new Set<string>();
  for (const opt of options) {
    // biome-ignore lint/suspicious/noExplicitAny: Zod internal walk.
    const obj: any = unwrap(opt);
    const shape = typeof obj._def.shape === "function" ? obj._def.shape() : obj.shape;
    const value = shape?.type?._def?.value;
    if (typeof value === "string") out.add(value);
  }
  return out;
}

describe("field capabilities catalog", () => {
  it("covers exactly the contract's node types (no drift)", () => {
    const fromContract = discriminatorsOf(fieldNodeSchema);
    expect(new Set(FIELD_TYPES)).toEqual(fromContract);
  });

  it("has a unique entry per type", () => {
    expect(new Set(FIELD_TYPES).size).toBe(FIELD_TYPES.length);
  });

  it("marks every layout container + array as a container", () => {
    for (const type of CONTAINER_FIELD_TYPES) {
      const cap = capabilityOf(type);
      expect(cap, type).toBeDefined();
      expect(cap?.isContainer, type).toBe(true);
    }
    // array is the only non-"layout" container, and is value-nesting
    expect(capabilityOf("array")?.category).toBe("array");
    expect(capabilityOf("array")?.valueShape).toBe("object[]");
    for (const type of LAYOUT_CONTAINER_TYPES) {
      const cap = capabilityOf(type);
      expect(cap?.category, type).toBe("layout");
      expect(cap?.valueShape, type).toBe("none");
    }
  });

  it("only flags hasOptions on choice fields and keeps shapes consistent", () => {
    for (const cap of FIELD_CAPABILITIES) {
      if (cap.isContainer) continue;
      expect(typeof cap.summary).toBe("string");
      expect(cap.summary.length).toBeGreaterThan(0);
    }
  });

  it("formCapabilities() reports the current form version", () => {
    const payload = formCapabilities();
    expect(payload.formVersion).toBe(CURRENT_FORM_VERSION);
    expect(payload.fields).toBe(FIELD_CAPABILITIES);
  });
});
