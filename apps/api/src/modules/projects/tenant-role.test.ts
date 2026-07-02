import { describe, expect, it } from "vitest";
import { projectRoleFromFunctions } from "./tenant-role.js";

describe("projectRoleFromFunctions (B3)", () => {
  it("maps the * wildcard to owner (tenant admin manages every project)", () => {
    expect(projectRoleFromFunctions(["*"])).toBe("owner");
    expect(projectRoleFromFunctions(["form.read", "*"])).toBe("owner");
  });

  it("maps any manage-level function to editor", () => {
    expect(projectRoleFromFunctions(["form.manage"])).toBe("editor");
    expect(projectRoleFromFunctions(["workflow.manage"])).toBe("editor");
    expect(projectRoleFromFunctions(["submission.manage"])).toBe("editor");
    expect(projectRoleFromFunctions(["version.publish"])).toBe("editor");
    expect(projectRoleFromFunctions(["form.read", "submission.manage"])).toBe("editor");
  });

  it("maps read/run-level functions to viewer", () => {
    expect(projectRoleFromFunctions(["form.read"])).toBe("viewer");
    expect(projectRoleFromFunctions(["workflow.read"])).toBe("viewer");
    expect(projectRoleFromFunctions(["submission.read"])).toBe("viewer");
    expect(projectRoleFromFunctions(["workflow.run"])).toBe("viewer");
  });

  it("confers no access for no roles or admin-only functions", () => {
    expect(projectRoleFromFunctions([])).toBeNull();
    expect(projectRoleFromFunctions(["role.admin", "user.admin", "org.admin"])).toBeNull();
  });
});
