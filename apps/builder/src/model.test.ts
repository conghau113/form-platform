import { CURRENT_FORM_VERSION, formSchema, migrate } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import example from "../../../examples/form.v1.json";
import {
  type EditorModel,
  fromFormSchema,
  insertField,
  moveField,
  type newField,
  toFormSchema,
  updateField,
} from "./model";

describe("editor <-> schema boundary", () => {
  it("round-trips the saved example into a valid current-version schema", () => {
    const model = fromFormSchema(example);
    const result = toFormSchema(model);
    expect(result.formVersion).toBe(CURRENT_FORM_VERSION);
    expect(() => formSchema.parse(result)).not.toThrow();
  });

  it("produces JSON identical to migrate() (renders identically)", () => {
    // The preview feeds the renderer this exact object; it must match what the
    // renderer would have migrated the saved fixture into.
    expect(toFormSchema(fromFormSchema(example))).toEqual(migrate(example));
  });
});

/** Author the example form purely through palette/property-panel operations. */
function authorExample(): EditorModel {
  let model: EditorModel = { id: "contact-request", title: "Contact request", fields: [] };
  const add = (type: Parameters<typeof newField>[0], patch: Parameters<typeof updateField>[2]) => {
    model = insertField(model, type, model.fields.length);
    const uid = model.fields[model.fields.length - 1].uid;
    model = updateField(model, uid, patch);
  };
  add("text", {
    name: "fullName",
    label: "Full name",
    required: true,
    layout: { colSpan: { lg: 12 } },
  });
  add("text", { name: "email", label: "Email", required: true, layout: { colSpan: { lg: 12 } } });
  add("select", {
    name: "country",
    label: "Country",
    options: [
      { label: "Vietnam", value: "VN" },
      { label: "Other", value: "OTHER" },
    ],
  });
  add("text", {
    name: "otherCountry",
    label: "Specify country",
    visibleWhen: { rule: { "==": [{ var: "country" }, "OTHER"] } },
  });
  add("text", {
    name: "internalNote",
    label: "Internal note",
    permissions: { viewRoles: ["admin"] },
    layout: { hideOnMobile: true },
  });
  return model;
}

describe("authoring the example visually", () => {
  it("reproduces the migrated example with no hand-edited JSON", () => {
    const built = toFormSchema(authorExample());
    expect(() => formSchema.parse(built)).not.toThrow();
    expect(built).toEqual(migrate(example));
  });
});

describe("pure mutators", () => {
  it("insertField inserts at the given index with a unique name", () => {
    let model: EditorModel = { id: "x", title: "X", fields: [] };
    model = insertField(model, "text", 0); // text1
    model = insertField(model, "text", 1); // text2
    model = insertField(model, "number", 1); // number1, between the two texts
    expect(model.fields.map((f) => f.field.type)).toEqual(["text", "number", "text"]);
    expect(model.fields.map((f) => f.field.name)).toEqual(["text1", "number1", "text2"]);
  });

  it("moveField reorders by uid", () => {
    const model = authorExample();
    const first = model.fields[0].uid;
    const third = model.fields[2].uid;
    const moved = moveField(model, first, third);
    expect(moved.fields.map((f) => f.field.name)).toEqual([
      "email",
      "country",
      "fullName",
      "otherCountry",
      "internalNote",
    ]);
  });

  it("keeps the dnd `uid` out of the schema", () => {
    const json = JSON.stringify(toFormSchema(authorExample()));
    expect(json).not.toContain("uid");
  });

  it("authors an array (Form List) node with item fields into valid JSON", () => {
    let model: EditorModel = { id: "list", title: "List", fields: [] };
    model = insertField(model, "array", 0);
    const uid = model.fields[0].uid;
    model = updateField(model, uid, {
      name: "contacts",
      label: "Contacts",
      minItems: 1,
      itemFields: [
        { type: "text", name: "fullName", label: "Full name", required: true },
        { type: "number", name: "age", label: "Age" },
      ],
    } as Parameters<typeof updateField>[2]);

    const built = toFormSchema(model);
    expect(() => formSchema.parse(built)).not.toThrow();
    expect(built.fields[0]).toMatchObject({
      type: "array",
      name: "contacts",
      minItems: 1,
    });
  });
});
