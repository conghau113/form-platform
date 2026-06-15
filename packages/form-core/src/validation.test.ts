import type { FormSchema, ValidationRule } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { buildZodSchema, collectAsyncFields, collectWarnings } from "./validation.js";

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

  it("excludes and strips a field hidden by a reaction visible:false", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "select",
          name: "kind",
          label: "Kind",
          reactions: [
            {
              when: { rule: { "==": [{ var: "kind" }, "person"] } },
              target: "vat",
              effect: "visible",
              value: false,
            },
          ],
        },
        { type: "text", name: "vat", label: "VAT", required: true },
      ]),
      { values: { kind: "person" } },
    );
    const result = schema.safeParse({ kind: "person" });
    expect(result.success).toBe(true);
    if (result.success) expect("vat" in result.data).toBe(false);
  });

  it("makes an optional field required via a reaction required effect", () => {
    const build = (kind: string) =>
      buildZodSchema(
        form([
          {
            type: "select",
            name: "kind",
            label: "Kind",
            reactions: [
              {
                when: { rule: { "==": [{ var: "kind" }, "company"] } },
                target: "vat",
                effect: "required",
              },
            ],
          },
          { type: "text", name: "vat", label: "VAT" },
        ]),
        { values: { kind } },
      );
    // person → vat stays optional; company → reaction requires it.
    expect(build("person").safeParse({ kind: "person" }).success).toBe(true);
    expect(build("company").safeParse({ kind: "company" }).success).toBe(false);
    expect(build("company").safeParse({ kind: "company", vat: "X1" }).success).toBe(true);
  });

  it("un-requires a statically-required field via a reaction required:false", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "select",
          name: "kind",
          label: "Kind",
          reactions: [
            {
              when: { rule: { "==": [{ var: "kind" }, "person"] } },
              target: "vat",
              effect: "required",
              value: false,
            },
          ],
        },
        { type: "text", name: "vat", label: "VAT", required: true },
      ]),
      { values: { kind: "person" } },
    );
    expect(schema.safeParse({ kind: "person" }).success).toBe(true);
  });

  it("lets a reaction visible:true override visibleWhen:false (field validates)", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "select",
          name: "kind",
          label: "Kind",
          reactions: [
            {
              when: { rule: { "==": [{ var: "kind" }, "company"] } },
              target: "vat",
              effect: "visible",
            },
          ],
        },
        {
          type: "text",
          name: "vat",
          label: "VAT",
          required: true,
          visibleWhen: { rule: { "==": [1, 0] } },
        },
      ]),
      { values: { kind: "company" } },
    );
    // visibleWhen would hide it, but the reaction shows it → required now blocks submit.
    expect(schema.safeParse({ kind: "company" }).success).toBe(false);
    expect(schema.safeParse({ kind: "company", vat: "VN123" }).success).toBe(true);
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

  it("accepts the X8 format checks (integer/number/money/idcard/zh/en/qq/zip)", () => {
    const field = (name: string, format: ValidationRule["format"]) => ({
      type: "text" as const,
      name,
      label: name,
      validations: [{ type: "format" as const, format }],
    });
    const schema = buildZodSchema(
      form([
        field("intf", "integer"),
        field("numf", "number"),
        field("money", "money"),
        field("idc", "idcard"),
        field("zh", "zh"),
        field("en", "en"),
        field("qq", "qq"),
        field("zip", "zip"),
      ]),
    );
    const ok = (v: Record<string, string>) => expect(schema.safeParse(v).success).toBe(true);
    const bad = (v: Record<string, string>) => expect(schema.safeParse(v).success).toBe(false);
    ok({ intf: "-42" });
    bad({ intf: "4.2" });
    ok({ numf: "3.14" });
    bad({ numf: "1.2.3" });
    ok({ money: "1,234.50" });
    bad({ money: "12.345" });
    ok({ idc: "11010519491231002X" });
    bad({ idc: "123" });
    ok({ zh: "中文" });
    bad({ zh: "abc" });
    ok({ en: "Hello" });
    bad({ en: "Hello1" });
    ok({ qq: "10001" });
    bad({ qq: "0123" });
    ok({ zip: "100000" });
    bad({ zip: "1234" });
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

  it("validates an array (Form List) as a nested array of row objects", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "array",
          name: "contacts",
          label: "Contacts",
          itemFields: [
            { type: "text", name: "fullName", label: "Full name", required: true },
            { type: "number", name: "age", label: "Age" },
          ],
        },
      ]),
    );
    // a row missing the required item field fails, pointing into the array path
    const bad = schema.safeParse({ contacts: [{ age: 30 }] });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues[0]?.path).toEqual(["contacts", 0, "fullName"]);
    }
    expect(schema.safeParse({ contacts: [{ fullName: "Ada", age: 30 }] }).success).toBe(true);
    // an optional array accepts an empty list (and undefined)
    expect(schema.safeParse({ contacts: [] }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("enforces minItems/maxItems and required on an array", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "array",
          name: "rows",
          label: "Rows",
          minItems: 1,
          maxItems: 2,
          itemFields: [{ type: "text", name: "v", label: "V" }],
        },
      ]),
    );
    expect(schema.safeParse({ rows: [] }).success).toBe(false); // below minItems
    expect(schema.safeParse({ rows: [{ v: "a" }] }).success).toBe(true);
    expect(schema.safeParse({ rows: [{ v: "a" }, { v: "b" }, { v: "c" }] }).success).toBe(false); // above max
  });

  it("treats `required` on an array as minItems 1", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "array",
          name: "rows",
          label: "Rows",
          required: true,
          itemFields: [{ type: "text", name: "v", label: "V" }],
        },
      ]),
    );
    expect(schema.safeParse({ rows: [] }).success).toBe(false);
    expect(schema.safeParse({ rows: [{ v: "a" }] }).success).toBe(true);
  });

  it("does not let an explicit minItems 0 cancel required on an array", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "array",
          name: "rows",
          label: "Rows",
          required: true,
          minItems: 0,
          itemFields: [{ type: "text", name: "v", label: "V" }],
        },
      ]),
    );
    // required wins over the looser minItems:0 -> an empty list still fails
    expect(schema.safeParse({ rows: [] }).success).toBe(false);
    expect(schema.safeParse({ rows: [{ v: "a" }] }).success).toBe(true);
  });

  it("evaluates per-row visibleWhen against the row's own values (G4)", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "array",
          name: "rows",
          label: "Rows",
          itemFields: [
            { type: "select", name: "kind", label: "Kind" },
            {
              type: "text",
              name: "detail",
              label: "Detail",
              required: true,
              visibleWhen: { rule: { "==": [{ var: "kind" }, "other"] } },
            },
          ],
        },
      ]),
      { values: { rows: [{ kind: "vn" }, { kind: "other" }] } },
    );
    // row 0: detail hidden -> passes; row 1: detail visible + required + missing -> fails
    const result = schema.safeParse({ rows: [{ kind: "vn" }, { kind: "other" }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["rows", 1, "detail"]);
    }
    // filling row 1's detail clears it
    expect(
      schema.safeParse({ rows: [{ kind: "vn" }, { kind: "other", detail: "x" }] }).success,
    ).toBe(true);
  });

  it("merges outer form values into the row scope for per-row visibility (G4)", () => {
    const make = (mode: string) =>
      buildZodSchema(
        form([
          { type: "select", name: "mode", label: "Mode" },
          {
            type: "array",
            name: "rows",
            label: "Rows",
            itemFields: [
              {
                type: "text",
                name: "extra",
                label: "Extra",
                required: true,
                visibleWhen: { rule: { "==": [{ var: "mode" }, "full"] } },
              },
            ],
          },
        ]),
        { values: { mode, rows: [{}] } },
      );
    // mode=full -> row's `extra` is visible+required+missing -> fails
    expect(make("full").safeParse({ mode: "full", rows: [{}] }).success).toBe(false);
    // mode=lite -> `extra` hidden in the row -> passes
    expect(make("lite").safeParse({ mode: "lite", rows: [{}] }).success).toBe(true);
  });

  it("strips a row's reaction/visibility-hidden keys from the clean output (G4)", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "array",
          name: "rows",
          label: "Rows",
          itemFields: [
            { type: "select", name: "kind", label: "Kind" },
            {
              type: "text",
              name: "detail",
              label: "Detail",
              visibleWhen: { rule: { "==": [{ var: "kind" }, "other"] } },
            },
          ],
        },
      ]),
      { values: { rows: [{ kind: "vn", detail: "leftover" }] } },
    );
    const result = schema.safeParse({ rows: [{ kind: "vn", detail: "leftover" }] });
    expect(result.success).toBe(true);
    if (result.success) {
      const rows = result.data.rows as Record<string, unknown>[];
      expect("detail" in rows[0]).toBe(false);
      expect(rows[0]).toEqual({ kind: "vn" });
    }
  });

  it("applies a per-row reaction visible:false to drop a row field (G4)", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "array",
          name: "rows",
          label: "Rows",
          itemFields: [
            {
              type: "select",
              name: "kind",
              label: "Kind",
              reactions: [
                {
                  when: { rule: { "==": [{ var: "kind" }, "person"] } },
                  target: "vat",
                  effect: "visible",
                  value: false,
                },
              ],
            },
            { type: "text", name: "vat", label: "VAT", required: true },
          ],
        },
      ]),
      { values: { rows: [{ kind: "person" }] } },
    );
    // the reaction hides `vat` in that row, so its required rule doesn't block submit
    const result = schema.safeParse({ rows: [{ kind: "person" }] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("vat" in (result.data.rows as Record<string, unknown>[])[0]).toBe(false);
    }
  });
});

describe("buildZodSchema with layout containers", () => {
  it("hoists fields inside tabs/card/grid/space into the flat shape", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "tabs",
          children: [
            {
              type: "tab-pane",
              label: "Main",
              children: [
                {
                  type: "card",
                  title: "Inner",
                  children: [
                    {
                      type: "grid",
                      cols: 2,
                      children: [{ type: "text", name: "a", label: "A", required: true }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: "space", children: [{ type: "switch", name: "b", label: "B" }] },
      ]),
    );
    expect(schema.safeParse({}).success).toBe(false); // nested `a` is required
    const ok = schema.safeParse({ a: "x", b: true });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ a: "x", b: true });
  });

  it("excludes all descendants of a container hidden by visibleWhen", () => {
    const fields: FormSchema["fields"] = [
      { type: "select", name: "mode", label: "Mode" },
      {
        type: "card",
        visibleWhen: { rule: { "==": [{ var: "mode" }, "full"] } },
        children: [{ type: "text", name: "details", label: "Details", required: true }],
      },
    ];
    const hidden = buildZodSchema(form(fields), { values: { mode: "lite" } });
    expect(hidden.safeParse({ mode: "lite" }).success).toBe(true);
    const shown = buildZodSchema(form(fields), { values: { mode: "full" } });
    expect(shown.safeParse({ mode: "full" }).success).toBe(false);
  });

  it("excludes fields inside a hidden tab-pane", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "tabs",
          children: [
            {
              type: "tab-pane",
              label: "Hidden",
              visibleWhen: { rule: { "==": [1, 0] } },
              children: [{ type: "text", name: "secret", label: "Secret", required: true }],
            },
          ],
        },
      ]),
    );
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("excludes container descendants the role cannot view", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "card",
          permissions: { viewRoles: ["admin"] },
          children: [{ type: "text", name: "note", label: "Note", required: true }],
        },
      ]),
      { access: { roles: ["user"] } },
    );
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("validates a container inside an array's itemFields (children hoist per row)", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "array",
          name: "jobs",
          label: "Jobs",
          itemFields: [
            {
              type: "card",
              title: "Details",
              children: [{ type: "text", name: "company", label: "Company", required: true }],
            },
          ],
        },
      ]),
    );
    expect(schema.safeParse({ jobs: [{}] }).success).toBe(false);
    expect(schema.safeParse({ jobs: [{ company: "ACME" }] }).success).toBe(true);
  });

  it("validates an array nested inside a tab pane at the top level", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "tabs",
          children: [
            {
              type: "tab-pane",
              label: "Exp",
              children: [
                {
                  type: "array",
                  name: "rows",
                  label: "Rows",
                  minItems: 1,
                  itemFields: [{ type: "text", name: "v", label: "V" }],
                },
              ],
            },
          ],
        },
      ]),
    );
    expect(schema.safeParse({ rows: [] }).success).toBe(false);
    expect(schema.safeParse({ rows: [{ v: "x" }] }).success).toBe(true);
  });

  it("validates a checkbox-group as an array (required ⇒ ≥1)", () => {
    const required = buildZodSchema(
      form([
        {
          type: "checkbox-group",
          name: "perks",
          label: "Perks",
          required: true,
          options: [{ label: "Gym", value: "gym" }],
        },
      ]),
    );
    expect(required.safeParse({ perks: [] }).success).toBe(false);
    expect(required.safeParse({ perks: ["gym"] }).success).toBe(true);

    const optional = buildZodSchema(
      form([{ type: "checkbox-group", name: "perks", label: "Perks" }]),
    );
    expect(optional.safeParse({}).success).toBe(true);
    expect(optional.safeParse({ perks: ["gym", "lunch"] }).success).toBe(true);
  });

  it("validates an upload as an array (required ⇒ ≥1, maxCount bounds it)", () => {
    const file = { uid: "1", name: "a.pdf" };
    const required = buildZodSchema(
      form([{ type: "upload", name: "docs", label: "Docs", required: true, maxCount: 2 }]),
    );
    expect(required.safeParse({ docs: [] }).success).toBe(false);
    expect(required.safeParse({ docs: [file] }).success).toBe(true);
    expect(
      required.safeParse({ docs: [file, { uid: "2", name: "b" }, { uid: "3", name: "c" }] })
        .success,
    ).toBe(false);

    const optional = buildZodSchema(form([{ type: "upload", name: "docs", label: "Docs" }]));
    expect(optional.safeParse({}).success).toBe(true);
  });

  it("validates a cascader as a path array (required ⇒ non-empty)", () => {
    const required = buildZodSchema(
      form([{ type: "cascader", name: "region", label: "Region", required: true }]),
    );
    expect(required.safeParse({ region: [] }).success).toBe(false);
    expect(required.safeParse({}).success).toBe(false);
    expect(required.safeParse({ region: ["vn", "hcm"] }).success).toBe(true);

    const optional = buildZodSchema(form([{ type: "cascader", name: "region", label: "Region" }]));
    expect(optional.safeParse({}).success).toBe(true);
    expect(optional.safeParse({ region: ["vn"] }).success).toBe(true);
  });

  it("validates a tree-select as scalar, or array when multiple", () => {
    const scalar = buildZodSchema(
      form([{ type: "tree-select", name: "dept", label: "Dept", required: true }]),
    );
    expect(scalar.safeParse({}).success).toBe(false);
    expect(scalar.safeParse({ dept: "" }).success).toBe(false);
    expect(scalar.safeParse({ dept: "eng" }).success).toBe(true);

    const multi = buildZodSchema(
      form([{ type: "tree-select", name: "dept", label: "Dept", required: true, multiple: true }]),
    );
    expect(multi.safeParse({ dept: [] }).success).toBe(false);
    expect(multi.safeParse({ dept: ["eng", "qa"] }).success).toBe(true);

    const optional = buildZodSchema(form([{ type: "tree-select", name: "dept", label: "Dept" }]));
    expect(optional.safeParse({}).success).toBe(true);
  });

  it("validates date-range/time-range presence as a full [start, end] tuple", () => {
    const stub = { format: () => "x" }; // dayjs-like; the shape is renderer-owned
    const required = buildZodSchema(
      form([{ type: "date-range", name: "stay", label: "Stay", required: true }]),
    );
    expect(required.safeParse({}).success).toBe(false);
    expect(required.safeParse({ stay: null }).success).toBe(false);
    expect(required.safeParse({ stay: [stub, null] }).success).toBe(false);
    expect(required.safeParse({ stay: [stub, stub] }).success).toBe(true);

    // antd's clear emits null; an optional range accepts it.
    const optional = buildZodSchema(form([{ type: "time-range", name: "shift", label: "Shift" }]));
    expect(optional.safeParse({}).success).toBe(true);
    expect(optional.safeParse({ shift: null }).success).toBe(true);
  });
});

describe("validation severity + cross rules (Phase N)", () => {
  it("warning rules never reach the blocking schema", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "text",
          name: "bio",
          label: "Bio",
          validations: [{ type: "min", value: 10, severity: "warning" }],
        },
      ]),
    );
    expect(schema.safeParse({ bio: "short" }).success).toBe(true);
  });

  it("a warning-severity required rule does not block submit", () => {
    const schema = buildZodSchema(
      form([
        {
          type: "text",
          name: "nick",
          label: "Nick",
          validations: [{ type: "required", severity: "warning" }],
        },
      ]),
    );
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("an error cross rule fails the field with its message and passes when satisfied", () => {
    const fields: FormSchema["fields"] = [
      { type: "number", name: "start", label: "Start" },
      {
        type: "number",
        name: "end",
        label: "End",
        validations: [
          {
            type: "cross",
            rule: { "<=": [{ var: "start" }, { var: "end" }] },
            message: "End must be after start",
          },
        ],
      },
    ];
    const bad = { start: 5, end: 3 };
    const res = buildZodSchema(form(fields), { values: bad }).safeParse(bad);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.path).toEqual(["end"]);
      expect(res.error.issues[0]?.message).toBe("End must be after start");
    }
    const good = { start: 3, end: 5 };
    expect(buildZodSchema(form(fields), { values: good }).safeParse(good).success).toBe(true);
  });

  it("a warning-severity cross rule does not block", () => {
    const values = { start: 5, end: 3 };
    const schema = buildZodSchema(
      form([
        { type: "number", name: "start", label: "Start" },
        {
          type: "number",
          name: "end",
          label: "End",
          validations: [
            {
              type: "cross",
              rule: { "<=": [{ var: "start" }, { var: "end" }] },
              severity: "warning",
            },
          ],
        },
      ]),
      { values },
    );
    expect(schema.safeParse(values).success).toBe(true);
  });

  it("a cross rule inside an array row evaluates against the merged row scope", () => {
    const fields: FormSchema["fields"] = [
      {
        type: "array",
        name: "ranges",
        label: "Ranges",
        itemFields: [
          { type: "number", name: "lo", label: "Lo" },
          {
            type: "number",
            name: "hi",
            label: "Hi",
            validations: [
              { type: "cross", rule: { "<": [{ var: "lo" }, { var: "hi" }] }, message: "lo < hi" },
            ],
          },
        ],
      },
    ];
    const values = {
      ranges: [
        { lo: 1, hi: 2 },
        { lo: 9, hi: 4 },
      ],
    };
    const res = buildZodSchema(form(fields), { values }).safeParse(values);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.path).toEqual(["ranges", 1, "hi"]);
      expect(res.error.issues[0]?.message).toBe("lo < hi");
    }
  });
});

describe("collectWarnings", () => {
  it("returns the warning message for a violated rule and nothing when satisfied", () => {
    const f = form([
      {
        type: "text",
        name: "bio",
        label: "Bio",
        validations: [{ type: "min", value: 10, severity: "warning", message: "Quite short" }],
      },
    ]);
    expect(collectWarnings(f, { bio: "tiny" })).toEqual({ bio: "Quite short" });
    expect(collectWarnings(f, { bio: "long enough text" })).toEqual({});
  });

  it("only a warning-severity required rule warns about emptiness (the flag stays blocking)", () => {
    const f = form([
      {
        type: "text",
        name: "nick",
        label: "Nick",
        required: true,
        validations: [{ type: "required", severity: "warning", message: "Please fill" }],
      },
      {
        type: "text",
        name: "alias",
        label: "Alias",
        required: true,
        validations: [{ type: "min", value: 2, severity: "warning" }],
      },
    ]);
    const out = collectWarnings(f, {});
    expect(out.nick).toBe("Please fill");
    // The static required flag belongs to the blocking path, not the warning channel.
    expect(out.alias).toBeUndefined();
  });

  it("uses dotted paths for array rows and skips hidden fields", () => {
    const f = form([
      { type: "select", name: "mode", label: "Mode" },
      {
        type: "text",
        name: "hiddenField",
        label: "Hidden",
        visibleWhen: { rule: { "==": [{ var: "mode" }, "on"] } },
        validations: [{ type: "min", value: 5, severity: "warning", message: "W" }],
      },
      {
        type: "array",
        name: "rows",
        label: "Rows",
        itemFields: [
          {
            type: "text",
            name: "code",
            label: "Code",
            validations: [{ type: "len", value: 3, severity: "warning", message: "3 chars" }],
          },
        ],
      },
    ]);
    const out = collectWarnings(f, { mode: "off", hiddenField: "x", rows: [{ code: "abcd" }] });
    expect(out).toEqual({ "rows.0.code": "3 chars" });
  });

  it("includes warning cross rules", () => {
    const f = form([
      { type: "number", name: "start", label: "Start" },
      {
        type: "number",
        name: "end",
        label: "End",
        validations: [
          {
            type: "cross",
            rule: { "<=": [{ var: "start" }, { var: "end" }] },
            severity: "warning",
            message: "Ends before it starts",
          },
        ],
      },
    ]);
    expect(collectWarnings(f, { start: 5, end: 3 })).toEqual({ end: "Ends before it starts" });
    expect(collectWarnings(f, { start: 1, end: 3 })).toEqual({});
  });
});

describe("collectAsyncFields", () => {
  it("lists visible leaves with an asyncValidator, top-level and per row", () => {
    const f = form([
      {
        type: "text",
        name: "username",
        label: "Username",
        asyncValidator: { url: "/check" },
      },
      {
        type: "text",
        name: "hiddenField",
        label: "Hidden",
        visibleWhen: { rule: { "==": [1, 0] } },
        asyncValidator: { url: "/never" },
      },
      {
        type: "array",
        name: "members",
        label: "Members",
        itemFields: [
          { type: "text", name: "email", label: "Email", asyncValidator: { url: "/check-email" } },
        ],
      },
    ]);
    const out = collectAsyncFields(f, { members: [{ email: "a" }, { email: "b" }] });
    expect(out).toEqual([
      { path: "username", name: "username", validator: { url: "/check" } },
      { path: "members.0.email", name: "email", validator: { url: "/check-email" } },
      { path: "members.1.email", name: "email", validator: { url: "/check-email" } },
    ]);
  });
});
