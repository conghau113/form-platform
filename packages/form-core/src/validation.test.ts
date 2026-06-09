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

  it("enforces format/pattern/len validation rules with custom messages", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "text",
          name: "email",
          label: "Email",
          required: true,
          validations: [{ type: "format", format: "email", message: "Bad email" }],
        },
        {
          type: "text",
          name: "code",
          label: "Code",
          validations: [{ type: "pattern", value: "^[A-Z]{3}$", message: "3 caps" }],
        },
        {
          type: "text",
          name: "pin",
          label: "PIN",
          required: true,
          validations: [{ type: "len", value: 4 }],
        },
      ]),
    );
    // invalid email surfaces the rule's custom message
    const bad = schema.safeParse({ email: "nope", pin: "1234" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.some((i) => i.message === "Bad email")).toBe(true);
    }
    // an optional pattern field accepts empty (untouched) but rejects a non-match
    expect(schema.safeParse({ email: "a@b.co", pin: "1234", code: "" }).success).toBe(true);
    expect(schema.safeParse({ email: "a@b.co", pin: "1234", code: "ab" }).success).toBe(false);
    expect(schema.safeParse({ email: "a@b.co", pin: "1234", code: "ABC" }).success).toBe(true);
    // len rule: exactly 4 chars
    expect(schema.safeParse({ email: "a@b.co", pin: "123" }).success).toBe(false);
    expect(schema.safeParse({ email: "a@b.co", pin: "1234" }).success).toBe(true);
  });

  it("accepts the url and phone format checks", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "text",
          name: "site",
          label: "Site",
          validations: [{ type: "format", format: "url" }],
        },
        {
          type: "text",
          name: "tel",
          label: "Tel",
          validations: [{ type: "format", format: "phone" }],
        },
      ]),
    );
    expect(schema.safeParse({ site: "not a url" }).success).toBe(false);
    expect(schema.safeParse({ site: "https://example.com" }).success).toBe(true);
    expect(schema.safeParse({ tel: "abc" }).success).toBe(false);
    expect(schema.safeParse({ tel: "+84 90 123 4567" }).success).toBe(true);
  });

  it("treats a `required` validation rule like the required flag", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "text",
          name: "name",
          label: "Name",
          validations: [{ type: "required", message: "Need a name" }],
        },
      ]),
    );
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Need a name");
    }
    expect(schema.safeParse({ name: "Ada" }).success).toBe(true);
  });

  it("applies number min/max validation rules", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "number",
          name: "qty",
          label: "Qty",
          required: true,
          validations: [
            { type: "min", value: 1, message: "At least 1" },
            { type: "max", value: 9 },
          ],
        },
      ]),
    );
    expect(schema.safeParse({ qty: 0 }).success).toBe(false);
    expect(schema.safeParse({ qty: 10 }).success).toBe(false);
    expect(schema.safeParse({ qty: 5 }).success).toBe(true);
  });

  it("ignores a malformed regex pattern instead of throwing", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "text",
          name: "x",
          label: "X",
          validations: [{ type: "pattern", value: "([unclosed" }],
        },
      ]),
    );
    // bad pattern is skipped, so any value passes
    expect(schema.safeParse({ x: "anything" }).success).toBe(true);
  });

  it("does not run validation rules for a hidden field", () => {
    const schema = buildZodSchema(
      form([
        { type: "select", name: "kind", label: "Kind" },
        {
          type: "text",
          name: "email",
          label: "Email",
          validations: [{ type: "format", format: "email" }],
          visibleWhen: { rule: { "==": [{ var: "kind" }, "EMAIL"] } },
        },
      ]),
      { values: { kind: "SMS" } },
    );
    // hidden -> its email rule must not run even with a bad value present
    expect(schema.safeParse({ kind: "SMS", email: "not-an-email" }).success).toBe(true);
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
