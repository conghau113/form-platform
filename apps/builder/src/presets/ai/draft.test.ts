import type { PresetDraft } from "@org/form-ai";
import { describe, expect, it } from "vitest";
import { presetFromDraft, previewFormFromDraft } from "./draft";

const draft: PresetDraft = {
  name: "Vietnam phone number",
  fieldType: "text",
  icon: "antd:PhoneOutlined",
  patch: { label: "Số điện thoại", required: true },
};

describe("presetFromDraft", () => {
  it("mints a user id and carries the draft body", () => {
    const preset = presetFromDraft(draft);
    expect(preset.id).toMatch(/^user-/);
    expect(preset.fieldType).toBe("text");
    expect(preset.name).toBe("Vietnam phone number");
    expect(preset.icon).toBe("antd:PhoneOutlined");
    expect(preset.patch).toEqual({ label: "Số điện thoại", required: true });
    expect(preset.scope).toBeUndefined();
  });

  it("applies a project scope when given", () => {
    const preset = presetFromDraft(draft, { scope: "project", projectId: "p1" });
    expect(preset.scope).toBe("project");
    expect(preset.projectId).toBe("p1");
  });

  it("falls back to a patch prefix/suffix icon when the envelope has none", () => {
    const preset = presetFromDraft({
      name: "Search",
      fieldType: "text",
      patch: { label: "Search", prefixIcon: "antd:SearchOutlined" },
    });
    expect(preset.icon).toBe("antd:SearchOutlined");
  });

  it("gives untitled drafts a fallback name", () => {
    const preset = presetFromDraft({ name: "  ", fieldType: "text", patch: { label: "X" } });
    expect(preset.name).toBe("Preset chưa đặt tên");
  });
});

describe("previewFormFromDraft", () => {
  it("builds a stamped one-field form for preview", () => {
    const form = previewFormFromDraft(draft);
    expect(form.formVersion).toBeGreaterThan(0);
    expect(form.fields).toHaveLength(1);
    const field = form.fields[0];
    expect(field.type).toBe("text");
    expect("label" in field && field.label).toBe("Số điện thoại");
  });
});
