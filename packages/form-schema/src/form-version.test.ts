import { describe, expect, it } from "vitest";
import { formVersionSchema, parseFormVersion } from "./form-version.js";
import { CURRENT_FORM_VERSION } from "./schema.js";

const body = {
  formVersion: CURRENT_FORM_VERSION,
  id: "contact",
  title: "Contact",
  fields: [{ type: "text", name: "email", label: "Email" }],
};

const valid = {
  id: "ver-1",
  formId: "contact",
  version: 1,
  formVersion: CURRENT_FORM_VERSION,
  body,
  publishedBy: "owner-1",
  publishedAt: "2026-06-29T00:00:00.000Z",
};

describe("formVersionSchema", () => {
  it("accepts a well-formed version and freezes a full form snapshot", () => {
    const out = parseFormVersion(valid);
    expect(out.formId).toBe("contact");
    expect(out.version).toBe(1);
    expect(out.body.formVersion).toBe(CURRENT_FORM_VERSION);
    expect(out.body.fields).toHaveLength(1);
  });

  it("rejects a non-positive version (sequence is 1-based)", () => {
    expect(formVersionSchema.safeParse({ ...valid, version: 0 }).success).toBe(false);
  });

  it("rejects a body that is not a valid form", () => {
    expect(() => parseFormVersion({ ...valid, body: { nope: true } })).toThrow();
  });

  it("requires publishedBy", () => {
    expect(formVersionSchema.safeParse({ ...valid, publishedBy: "" }).success).toBe(false);
  });
});
