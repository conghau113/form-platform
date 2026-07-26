import type { FieldNode } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { presetFromField, presetPatchFromField } from "./patch";

const field = {
  type: "text",
  name: "q",
  label: "Search",
  placeholder: "Search",
  prefixIcon: "antd:SearchOutlined",
} as FieldNode;

describe("presetPatchFromField", () => {
  it("drops the instance-identity keys (type, name)", () => {
    const patch = presetPatchFromField(field);
    expect(patch).not.toHaveProperty("type");
    expect(patch).not.toHaveProperty("name");
    expect(patch).toMatchObject({
      label: "Search",
      placeholder: "Search",
      prefixIcon: "antd:SearchOutlined",
    });
  });

  it("omits undefined values", () => {
    const patch = presetPatchFromField({
      type: "text",
      name: "x",
      label: undefined,
    } as unknown as FieldNode);
    expect(patch).not.toHaveProperty("label");
  });
});

describe("presetFromField", () => {
  it("carries the field type and trims the name", () => {
    const preset = presetFromField("  Search input  ", field);
    expect(preset.fieldType).toBe("text");
    expect(preset.name).toBe("Search input");
    expect(preset.patch).not.toHaveProperty("name");
  });

  it("defaults the icon to the field's prefix icon token", () => {
    expect(presetFromField("Search", field).icon).toBe("antd:SearchOutlined");
  });

  it("falls back to a placeholder name when blank", () => {
    expect(presetFromField("   ", field).name).toBe("Preset chưa đặt tên");
  });
});
