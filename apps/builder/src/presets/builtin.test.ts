import { BUILTIN_ICON_TOKENS } from "@org/form-renderer-web";
import { fieldNodeSchema, parsePreset } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { newField } from "../field-registry";
import { BUILTIN_PRESETS } from "./builtin";

describe("BUILTIN_PRESETS", () => {
  it("every built-in preset is valid per the schema", () => {
    for (const preset of BUILTIN_PRESETS) {
      expect(() => parsePreset(preset)).not.toThrow();
    }
  });

  it("has unique ids", () => {
    const ids = BUILTIN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every preset seeds a node that parses against the field contract", () => {
    for (const preset of BUILTIN_PRESETS) {
      const node = newField(preset.fieldType, new Set(), preset.patch);
      expect(() => fieldNodeSchema.parse(node), `preset "${preset.id}"`).not.toThrow();
    }
  });

  it("only references icon tokens that ship with the renderer", () => {
    const known = new Set(BUILTIN_ICON_TOKENS);
    for (const preset of BUILTIN_PRESETS) {
      if (preset.icon) expect(known.has(preset.icon), `preset "${preset.id}"`).toBe(true);
    }
  });
});
