import { CURRENT_FORM_VERSION, type FieldNode, type FormSchema, migrate } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { diffForms, hasFormChanges } from "./diff";

/** Build a valid (migrated) form from a bare field list. */
function form(fields: FieldNode[]): FormSchema {
  return migrate({ formVersion: CURRENT_FORM_VERSION, id: "f", title: "F", fields });
}

const email: FieldNode = { type: "text", name: "email", label: "Email", required: true };
const phone: FieldNode = { type: "text", name: "phone", label: "Phone" };

describe("diffForms", () => {
  it("reports an added field", () => {
    const d = diffForms(form([email]), form([email, phone]));
    expect(d.added.map((f) => f.path)).toEqual(["phone"]);
    expect(d.removed).toHaveLength(0);
    expect(d.changed).toHaveLength(0);
    expect(hasFormChanges(d)).toBe(true);
  });

  it("reports a removed field", () => {
    const d = diffForms(form([email, phone]), form([email]));
    expect(d.removed.map((f) => f.path)).toEqual(["phone"]);
    expect(d.added).toHaveLength(0);
  });

  it("reports a relabelled field as changed with the differing key", () => {
    const d = diffForms(form([email]), form([{ ...email, label: "Email address" }]));
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].path).toBe("email");
    expect(d.changed[0].changedKeys).toContain("label");
  });

  it("reports a required toggle as changed", () => {
    const d = diffForms(form([phone]), form([{ ...phone, required: true }]));
    expect(d.changed[0].changedKeys).toContain("required");
  });

  it("sees through transparent layout containers (group children share the parent path)", () => {
    const grouped = form([{ type: "group", name: "g", children: [email, phone] } as FieldNode]);
    const flat = form([email, phone]);
    // Same leaves at the same paths despite the wrapping group ⇒ no diff.
    expect(hasFormChanges(diffForms(grouped, flat))).toBe(false);
  });

  it("keys array item fields under name[].child", () => {
    const withArray = form([{ type: "array", name: "items", itemFields: [phone] } as FieldNode]);
    const withArray2 = form([
      { type: "array", name: "items", itemFields: [phone, email] } as FieldNode,
    ]);
    const d = diffForms(withArray, withArray2);
    expect(d.added.map((f) => f.path)).toEqual(["items[].email"]);
  });

  it("reports no changes for an identical form", () => {
    const d = diffForms(form([email, phone]), form([email, phone]));
    expect(hasFormChanges(d)).toBe(false);
  });
});
