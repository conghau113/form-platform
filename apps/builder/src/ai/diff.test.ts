import { CURRENT_FORM_VERSION, migrate } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { appendForms, diffForms } from "./diff";

const form = (id: string, fields: unknown[]) =>
  migrate({ formVersion: CURRENT_FORM_VERSION, id, title: id, fields } as Record<string, unknown>);

const current = form("a", [
  { type: "text", name: "email", label: "Email" },
  { type: "text", name: "phone", label: "Phone" },
]);

const proposed = form("b", [
  { type: "text", name: "email", label: "Email" },
  { type: "textarea", name: "message", label: "Message" },
]);

describe("diffForms", () => {
  it("splits fields into added / removed / kept by name", () => {
    const d = diffForms(current, proposed);
    expect(d.added).toEqual(["message"]);
    expect(d.removed).toEqual(["phone"]);
    expect(d.kept).toEqual(["email"]);
    expect(d.currentCount).toBe(2);
    expect(d.proposedCount).toBe(2);
  });

  it("counts nested array item fields", () => {
    const withArray = form("c", [
      {
        type: "array",
        name: "items",
        label: "Items",
        itemFields: [{ type: "number", name: "qty", label: "Qty" }],
      },
    ]);
    const d = diffForms(form("e", []), withArray);
    expect(d.added).toEqual(["items", "qty"]);
    expect(d.proposedCount).toBe(2);
  });
});

describe("appendForms", () => {
  it("appends proposed fields and keeps the current id/title", () => {
    const merged = appendForms(current, proposed);
    expect(merged.id).toBe("a");
    expect(merged.title).toBe("a");
    expect(merged.fields).toHaveLength(4);
  });

  it("de-duplicates colliding names so no existing field is shadowed", () => {
    const merged = appendForms(current, proposed);
    const names = merged.fields.map((f) => ("name" in f ? f.name : undefined));
    expect(names).toEqual(["email", "phone", "email_2", "message"]);
  });
});
