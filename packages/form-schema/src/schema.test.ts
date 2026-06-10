import { describe, expect, it } from "vitest";
import { formSchema } from "./index.js";

describe("schema field types", () => {
  it("accepts a textarea field (additive type)", () => {
    const doc = {
      formVersion: 3,
      id: "with-textarea",
      title: "With textarea",
      fields: [
        { type: "textarea", name: "bio", label: "Bio", rows: 5, maxLength: 500 },
        { type: "text", name: "name", label: "Name" },
      ],
    };
    const out = formSchema.parse(doc);
    expect(out.fields[0]).toMatchObject({ type: "textarea", rows: 5 });
  });

  it("accepts the new control field types (additive)", () => {
    const doc = {
      formVersion: 3,
      id: "controls",
      title: "Controls",
      fields: [
        { type: "radio", name: "plan", label: "Plan", options: [{ label: "Pro", value: "pro" }] },
        { type: "switch", name: "active", label: "Active", defaultValue: true },
        { type: "slider", name: "vol", label: "Volume", min: 0, max: 100, step: 5 },
        { type: "rate", name: "stars", label: "Rating", count: 5, allowHalf: true },
        { type: "password", name: "pw", label: "Password", maxLength: 64 },
        { type: "time", name: "at", label: "At" },
        { type: "color", name: "brand", label: "Brand", tooltip: "Hex color", disabled: true },
      ],
    };
    const out = formSchema.parse(doc);
    expect(out.fields.map((f) => f.type)).toEqual([
      "radio",
      "switch",
      "slider",
      "rate",
      "password",
      "time",
      "color",
    ]);
  });

  it("accepts the additive common props on existing types", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "common",
      title: "Common",
      fields: [
        { type: "text", name: "n", label: "N", tooltip: "hi", disabled: true, defaultValue: "x" },
      ],
    });
    expect(out.fields[0]).toMatchObject({ tooltip: "hi", disabled: true, defaultValue: "x" });
  });

  it("accepts an array (Form List) node with recursive itemFields", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "with-array",
      title: "With array",
      fields: [
        {
          type: "array",
          name: "contacts",
          label: "Contacts",
          minItems: 1,
          maxItems: 5,
          itemFields: [
            { type: "text", name: "fullName", label: "Full name", required: true },
            { type: "number", name: "age", label: "Age" },
          ],
        },
      ],
    });
    expect(out.fields[0]).toMatchObject({ type: "array", minItems: 1, maxItems: 5 });
    expect(out.fields[0]).toHaveProperty("itemFields");
  });

  it("accepts the optional table variant on an array node", () => {
    const out = formSchema.parse({
      formVersion: 3,
      id: "array-table",
      title: "Array table",
      fields: [
        {
          type: "array",
          name: "rows",
          label: "Rows",
          variant: "table",
          itemFields: [{ type: "text", name: "v", label: "V" }],
        },
      ],
    });
    expect(out.fields[0]).toMatchObject({ type: "array", variant: "table" });
  });

  it("rejects an array whose itemFields is not an array", () => {
    expect(() =>
      formSchema.parse({
        formVersion: 3,
        id: "bad-array",
        title: "Bad array",
        fields: [{ type: "array", name: "rows", label: "Rows", itemFields: "nope" }],
      }),
    ).toThrow();
  });

  it("rejects an unknown field type", () => {
    expect(() =>
      formSchema.parse({
        formVersion: 3,
        id: "bad",
        title: "Bad",
        fields: [{ type: "bogus", name: "q", label: "Q" }],
      }),
    ).toThrow();
  });
});
