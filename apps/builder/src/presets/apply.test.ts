import { CURRENT_FORM_VERSION, type FormSchema, type Preset } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { appendLinkedField, collectFieldNames } from "./apply";

const preset: Preset = {
  id: "user-phone",
  fieldType: "text",
  name: "Phone",
  patch: { label: "Số điện thoại", required: true },
};

function form(fields: FormSchema["fields"]): FormSchema {
  return { formVersion: CURRENT_FORM_VERSION, id: "f", title: "F", fields };
}

describe("collectFieldNames", () => {
  it("collects names across children and array rows", () => {
    const names = collectFieldNames([
      { type: "text", name: "a", label: "A" },
      { type: "group", children: [{ type: "text", name: "b", label: "B" }] },
      { type: "array", name: "rows", itemFields: [{ type: "text", name: "c", label: "C" }] },
    ] as FormSchema["fields"]);
    expect(names).toEqual(new Set(["a", "b", "rows", "c"]));
  });
});

describe("appendLinkedField", () => {
  it("appends a linked field carrying presetId + snapshot + empty overrides", () => {
    const next = appendLinkedField(form([]), preset);
    expect(next.fields).toHaveLength(1);
    const field = next.fields[0] as Record<string, unknown>;
    expect(field.type).toBe("text");
    expect(field.presetId).toBe("user-phone");
    expect(field.overrides).toEqual({});
    expect(field.label).toBe("Số điện thoại");
    expect(field.required).toBe(true);
  });

  it("gives the appended field a name unique within the form", () => {
    const existing = form([{ type: "text", name: "text1", label: "Existing" }]);
    const next = appendLinkedField(existing, preset);
    const added = next.fields[1] as Record<string, unknown>;
    expect(added.name).not.toBe("text1");
  });

  it("does not mutate the input form", () => {
    const original = form([]);
    appendLinkedField(original, preset);
    expect(original.fields).toHaveLength(0);
  });
});
