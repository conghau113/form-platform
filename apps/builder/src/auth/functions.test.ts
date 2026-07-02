import { describe, expect, it } from "vitest";
import { hasAnyFunction, hasFunction } from "./functions";

describe("hasFunction (D1 permission helper)", () => {
  it("grants a directly held code and denies a missing one", () => {
    expect(hasFunction(["user.admin"], "user.admin")).toBe(true);
    expect(hasFunction(["user.admin"], "role.admin")).toBe(false);
    expect(hasFunction([], "role.admin")).toBe(false);
  });

  it("grants everything via the `*` wildcard (tenant admin)", () => {
    expect(hasFunction(["*"], "role.admin")).toBe(true);
    expect(hasFunction(["*"], "anything.at.all")).toBe(true);
  });

  it("hasAnyFunction mirrors the server's any-of guard", () => {
    expect(hasAnyFunction(["user.admin"], ["role.admin", "user.admin"])).toBe(true);
    expect(hasAnyFunction(["form.manage"], ["role.admin", "user.admin"])).toBe(false);
    expect(hasAnyFunction(["*"], ["role.admin"])).toBe(true);
  });
});
