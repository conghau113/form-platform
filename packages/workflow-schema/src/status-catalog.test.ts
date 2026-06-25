import { describe, expect, it } from "vitest";
import { parseStatusCatalogEntry, statusCatalogEntrySchema } from "./status-catalog.js";

const validEntry = {
  code: "pending",
  label: "Chờ duyệt",
  kind: "normal",
};

describe("statusCatalogEntrySchema", () => {
  it("parses a minimal entry (scope/color absent)", () => {
    const out = parseStatusCatalogEntry(validEntry);
    expect(out.code).toBe("pending");
    expect(out.kind).toBe("normal");
    expect(out.color).toBeUndefined();
    expect(out.scope).toBeUndefined();
  });

  it("parses a project-scoped entry with a custom colour", () => {
    const out = parseStatusCatalogEntry({
      ...validEntry,
      color: "#f5222d",
      scope: "project",
      projectId: "proj-1",
    });
    expect(out.scope).toBe("project");
    expect(out.projectId).toBe("proj-1");
    expect(out.color).toBe("#f5222d");
  });

  it("requires projectId when scope is 'project'", () => {
    expect(() => statusCatalogEntrySchema.parse({ ...validEntry, scope: "project" })).toThrow(
      /projectId is required/,
    );
  });

  it("rejects an unknown kind", () => {
    expect(() => statusCatalogEntrySchema.parse({ ...validEntry, kind: "optional" })).toThrow();
  });

  it("rejects a code that is not a simple identifier", () => {
    expect(() => statusCatalogEntrySchema.parse({ ...validEntry, code: "has space" })).toThrow();
  });
});
