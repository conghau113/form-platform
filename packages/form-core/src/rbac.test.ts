import type { FieldNode } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { canEdit, canView } from "./rbac.js";

const field = (permissions?: Record<string, unknown>): FieldNode =>
  ({ type: "text", name: "internalNote", label: "Internal note", permissions }) as FieldNode;

describe("canView", () => {
  it("is viewable when no viewRoles are set", () => {
    expect(canView(field(), { roles: [] })).toBe(true);
    expect(canView(field({ viewRoles: [] }), { roles: [] })).toBe(true);
  });

  it("is viewable when a context role matches", () => {
    expect(canView(field({ viewRoles: ["admin"] }), { roles: ["admin", "user"] })).toBe(true);
  });

  it("is hidden when no context role matches", () => {
    expect(canView(field({ viewRoles: ["admin"] }), { roles: ["user"] })).toBe(false);
    expect(canView(field({ viewRoles: ["admin"] }), { roles: [] })).toBe(false);
  });
});

describe("canEdit", () => {
  it("is editable when no editRoles are set", () => {
    expect(canEdit(field(), { roles: [] })).toBe(true);
  });

  it("respects editRoles independently of viewRoles", () => {
    expect(canEdit(field({ editRoles: ["admin"] }), { roles: ["admin"] })).toBe(true);
    expect(canEdit(field({ editRoles: ["admin"] }), { roles: ["user"] })).toBe(false);
  });
});
