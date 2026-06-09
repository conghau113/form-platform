import type { FormSchema } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { buildZodSchema } from "./validation.js";

function form(fields: FormSchema["fields"]): FormSchema {
  return { formVersion: 3, id: "t", title: "Test", fields };
}

describe("buildZodSchema", () => {
  it("blocks submit when a required field is missing", () => {
    const schema = buildZodSchema(
      form([{ type: "text", name: "fullName", label: "Full name", required: true }]),
    );
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["fullName"]);
    }
  });

  it("passes when the required field is filled", () => {
    const schema = buildZodSchema(
      form([{ type: "text", name: "fullName", label: "Full name", required: true }]),
    );
    expect(schema.safeParse({ fullName: "Ada" }).success).toBe(true);
  });

  it("does not validate a field hidden by visibleWhen=false", () => {
    const schema = buildZodSchema(
      form([
        { type: "select", name: "country", label: "Country" },
        {
          type: "text",
          name: "otherCountry",
          label: "Specify",
          required: true,
          visibleWhen: { rule: { "==": [{ var: "country" }, "OTHER"] } },
        },
      ]),
      { values: { country: "VN" } },
    );
    const result = schema.safeParse({ country: "VN" });
    expect(result.success).toBe(true);
    if (result.success) {
      // hidden field is stripped from the clean output
      expect("otherCountry" in result.data).toBe(false);
    }
  });

  it("validates the conditional field once it becomes visible", () => {
    const schema = buildZodSchema(
      form([
        { type: "select", name: "country", label: "Country" },
        {
          type: "text",
          name: "otherCountry",
          label: "Specify",
          required: true,
          visibleWhen: { rule: { "==": [{ var: "country" }, "OTHER"] } },
        },
      ]),
      { values: { country: "OTHER" } },
    );
    expect(schema.safeParse({ country: "OTHER" }).success).toBe(false);
    expect(schema.safeParse({ country: "OTHER", otherCountry: "NZ" }).success).toBe(true);
  });

  it("enforces number min/max and text maxLength", () => {
    const schema = buildZodSchema(
      form([
        { type: "number", name: "age", label: "Age", required: true, min: 18, max: 120 },
        { type: "text", name: "code", label: "Code", maxLength: 3 },
      ]),
    );
    expect(schema.safeParse({ age: 10 }).success).toBe(false);
    expect(schema.safeParse({ age: 200 }).success).toBe(false);
    expect(schema.safeParse({ age: 30, code: "abcd" }).success).toBe(false);
    expect(schema.safeParse({ age: 30, code: "ab" }).success).toBe(true);
  });

  it("validates the new control field types", () => {
    const schema = buildZodSchema(
      form([
        { type: "radio", name: "plan", label: "Plan", required: true },
        { type: "switch", name: "agree", label: "Agree", required: true },
        { type: "slider", name: "vol", label: "Volume", min: 0, max: 100 },
        { type: "rate", name: "stars", label: "Stars", required: true },
        { type: "password", name: "pw", label: "Password", required: true, maxLength: 4 },
        { type: "color", name: "brand", label: "Brand", required: true },
      ]),
    );
    // all required ones missing / boundary violations fail
    expect(schema.safeParse({ vol: 150 }).success).toBe(false);
    expect(
      schema.safeParse({
        plan: "pro",
        agree: true,
        vol: 50,
        stars: 4,
        pw: "abcde", // exceeds maxLength 4
        brand: "#fff",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        plan: "pro",
        agree: true,
        vol: 50,
        stars: 4,
        pw: "abcd",
        brand: "#fff",
      }).success,
    ).toBe(true);
    // a switch left false must block a required switch (same rule as checkbox)
    expect(
      schema.safeParse({ plan: "pro", agree: false, stars: 4, pw: "ok", brand: "#fff" }).success,
    ).toBe(false);
  });

  it("excludes fields the role cannot view when access is supplied", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "text",
          name: "internalNote",
          label: "Internal note",
          required: true,
          permissions: { viewRoles: ["admin"] },
        },
      ]),
      { access: { roles: [] } },
    );
    // not viewable -> not rendered -> must not block submit
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("flattens group children into the value object", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "group",
          name: "address",
          children: [{ type: "text", name: "city", label: "City", required: true }],
        },
      ]),
    );
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ city: "Hanoi" }).success).toBe(true);
  });
});
