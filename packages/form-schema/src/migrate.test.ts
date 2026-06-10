import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CURRENT_FORM_VERSION, migrate } from "./index.js";

describe("migrate", () => {
  it("migrates the saved examples/form.v1.json fixture up to the current version", () => {
    // The fixture lives at the repo root; resolve it relative to this test file
    // so the contract's "NEVER break older saved JSON" guarantee is exercised
    // against the real persisted document, not an inline copy.
    const url = new URL("../../../examples/form.v1.json", import.meta.url);
    const doc = JSON.parse(readFileSync(url, "utf8"));
    expect(doc.formVersion).toBe(1);

    const out = migrate(doc);

    // A successful return already means formSchema.parse() validated the shape.
    expect(out.formVersion).toBe(CURRENT_FORM_VERSION);
    // v1 -> v2 ran: legacy colSpanDesktop became layout.colSpan.lg.
    expect((out.fields[0] as any).layout.colSpan.lg).toBe(12);
    expect((out.fields[0] as any).colSpanDesktop).toBeUndefined();
  });

  it("upgrades a v1 document to the current version", () => {
    const v1 = {
      formVersion: 1,
      id: "demo",
      title: "Demo",
      fields: [{ type: "text", name: "fullName", label: "Full name", colSpanDesktop: 12 }],
    };
    const out = migrate(v1);
    expect(out.formVersion).toBe(CURRENT_FORM_VERSION);
    expect((out.fields[0] as any).layout.colSpan.lg).toBe(12);
    expect((out.fields[0] as any).colSpanDesktop).toBeUndefined();
  });

  it("migrates legacy props on fields nested inside an array's itemFields", () => {
    // The walk recurses itemFields, so the v1->v2 colSpanDesktop migration must reach
    // a field nested inside an array node (forward-proofing for array-nested fields).
    const v1 = {
      formVersion: 1,
      id: "nested",
      title: "Nested",
      fields: [
        {
          type: "array",
          name: "rows",
          label: "Rows",
          itemFields: [{ type: "text", name: "city", label: "City", colSpanDesktop: 8 }],
        },
      ],
    };
    const out = migrate(v1);
    expect(out.formVersion).toBe(CURRENT_FORM_VERSION);
    const item = (out.fields[0] as any).itemFields[0];
    expect(item.layout.colSpan.lg).toBe(8);
    expect(item.colSpanDesktop).toBeUndefined();
  });

  it("rejects a document newer than the renderer supports", () => {
    expect(() => migrate({ formVersion: 999, id: "x", title: "x", fields: [] })).toThrow();
  });
});
