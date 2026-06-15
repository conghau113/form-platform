import { parsePreset } from "@org/form-schema";
import { describe, expect, it } from "vitest";
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
});
