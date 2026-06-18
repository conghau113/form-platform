import { describe, expect, it } from "vitest";
import { parseFormFile, serializeForm } from "./io";

const V1_DOC = {
  formVersion: 1,
  id: "contact",
  title: "Contact",
  fields: [{ type: "text", name: "email", label: "Email", colSpanDesktop: 12 }],
};

describe("parseFormFile", () => {
  it("migrates an older valid document to the current version", () => {
    const schema = parseFormFile(JSON.stringify(V1_DOC));
    expect(schema.formVersion).toBe(3);
    // v1 -> v2 migration lifts colSpanDesktop into layout.colSpan.lg.
    expect(schema.fields[0]).toMatchObject({ name: "email", layout: { colSpan: { lg: 12 } } });
  });

  it("throws on malformed JSON", () => {
    expect(() => parseFormFile("{ not json")).toThrow();
  });

  it("throws on a document that fails schema validation", () => {
    expect(() => parseFormFile(JSON.stringify({ formVersion: 3, id: "x" }))).toThrow();
  });

  it("throws when formVersion is missing", () => {
    expect(() => parseFormFile(JSON.stringify({ id: "x", title: "y", fields: [] }))).toThrow();
  });
});

describe("serializeForm", () => {
  it("round-trips a schema through serialize -> parse", () => {
    const schema = parseFormFile(JSON.stringify(V1_DOC));
    expect(parseFormFile(serializeForm(schema))).toEqual(schema);
  });
});
