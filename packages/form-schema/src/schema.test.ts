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
