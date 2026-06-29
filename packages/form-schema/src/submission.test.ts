import { describe, expect, it } from "vitest";
import { CURRENT_FORM_VERSION } from "./schema.js";
import { parseSubmission, submissionSchema } from "./submission.js";

const snapshot = {
  formVersion: CURRENT_FORM_VERSION,
  id: "contact",
  title: "Contact",
  fields: [{ type: "text", name: "email", label: "Email" }],
};

const valid = {
  id: "sub-1",
  formId: "contact",
  formVersion: CURRENT_FORM_VERSION,
  schemaSnapshot: snapshot,
  data: { email: "a@b.com" },
  submittedBy: "owner-1",
  submittedAt: "2026-06-29T00:00:00.000Z",
};

describe("submissionSchema", () => {
  it("accepts a well-formed submission and pins a full form snapshot", () => {
    const out = parseSubmission(valid);
    expect(out.formId).toBe("contact");
    expect(out.schemaSnapshot.formVersion).toBe(CURRENT_FORM_VERSION);
    expect(out.schemaSnapshot.fields).toHaveLength(1);
    expect(out.data).toEqual({ email: "a@b.com" });
  });

  it("rejects an id that is not a simple identifier", () => {
    expect(() => parseSubmission({ ...valid, id: "bad id!" })).toThrow();
  });

  it("rejects a snapshot that is not a valid form", () => {
    expect(() => parseSubmission({ ...valid, schemaSnapshot: { nope: true } })).toThrow();
  });

  it("requires submittedBy", () => {
    const res = submissionSchema.safeParse({ ...valid, submittedBy: "" });
    expect(res.success).toBe(false);
  });
});
