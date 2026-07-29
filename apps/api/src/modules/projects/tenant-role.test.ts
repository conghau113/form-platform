import { describe, expect, it } from "vitest";
import {
  canRunWorkflow,
  collectAncestors,
  hasScopedGrant,
  projectRoleFromFunctions,
  projectRoleFromScopedGrants,
} from "./tenant-role.js";

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

describe("collectAncestors (C3)", () => {
  // hr (root) → eng → team; sales (root)
  const units = [
    { id: "hr", parentId: null },
    { id: "eng", parentId: "hr" },
    { id: "team", parentId: "eng" },
    { id: "sales", parentId: null },
  ];

  it("returns self + all ancestors up to the root", () => {
    expect([...collectAncestors(units, "team")]).toEqual(["team", "eng", "hr"]);
    expect([...collectAncestors(units, "eng")]).toEqual(["eng", "hr"]);
    expect([...collectAncestors(units, "hr")]).toEqual(["hr"]);
  });

  it("returns an empty set for an unplaced project (null start)", () => {
    expect(collectAncestors(units, null).size).toBe(0);
  });

  it("tolerates a missing start id and a broken chain", () => {
    expect([...collectAncestors(units, "ghost")]).toEqual(["ghost"]);
    const cyclic = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    expect([...collectAncestors(cyclic, "a")].sort()).toEqual(["a", "b"]);
  });
});

describe("projectRoleFromScopedGrants (C3)", () => {
  // project "team" sits under hr → eng → team
  const ancestorsOfTeam = new Set(["team", "eng", "hr"]);
  const ancestorsOfSales = new Set(["sales"]);

  it("treats an unscoped grant as tenant-wide (reaches any project)", () => {
    const grants = [{ functions: ["form.manage"], scopeOrgUnitIds: [] }];
    expect(projectRoleFromScopedGrants(grants, ancestorsOfTeam)).toBe("editor");
    expect(projectRoleFromScopedGrants(grants, ancestorsOfSales)).toBe("editor");
    expect(projectRoleFromScopedGrants(grants, new Set())).toBe("editor"); // unplaced project
  });

  it("applies a scoped grant only when it covers the project's subtree", () => {
    const grants = [{ functions: ["form.manage"], scopeOrgUnitIds: ["eng"] }];
    // team is inside eng's subtree → applies
    expect(projectRoleFromScopedGrants(grants, ancestorsOfTeam)).toBe("editor");
    // sales is outside → no access
    expect(projectRoleFromScopedGrants(grants, ancestorsOfSales)).toBeNull();
  });

  it("does not reach an unplaced project from a scoped grant", () => {
    const grants = [{ functions: ["form.manage"], scopeOrgUnitIds: ["hr"] }];
    expect(projectRoleFromScopedGrants(grants, new Set())).toBeNull();
  });

  it("unions functions across the grants that apply", () => {
    const grants = [
      { functions: ["form.read"], scopeOrgUnitIds: [] }, // tenant-wide viewer
      { functions: ["form.manage"], scopeOrgUnitIds: ["eng"] }, // editor inside eng
    ];
    expect(projectRoleFromScopedGrants(grants, ancestorsOfTeam)).toBe("editor"); // union → editor
    expect(projectRoleFromScopedGrants(grants, ancestorsOfSales)).toBe("viewer"); // only tenant-wide applies
  });

  it("the * admin role stays tenant-wide when unscoped", () => {
    const grants = [{ functions: ["*"], scopeOrgUnitIds: [] }];
    expect(projectRoleFromScopedGrants(grants, ancestorsOfSales)).toBe("owner");
    expect(projectRoleFromScopedGrants(grants, new Set())).toBe("owner");
  });

  it("confers no access with no grants", () => {
    expect(projectRoleFromScopedGrants([], ancestorsOfTeam)).toBeNull();
  });
});

describe("hasScopedGrant (C3)", () => {
  it("is true only when some grant carries data-scope org units", () => {
    expect(hasScopedGrant([{ functions: ["form.read"], scopeOrgUnitIds: [] }])).toBe(false);
    expect(hasScopedGrant([{ functions: ["form.read"], scopeOrgUnitIds: ["hr"] }])).toBe(true);
    expect(hasScopedGrant([])).toBe(false);
  });
});

describe("canRunWorkflow (Phase E — running is its own permission)", () => {
  const unscoped = (...functions: string[]) => [{ functions, scopeOrgUnitIds: [] }];
  const none = new Set<string>();

  it("lets workflow.run operate a case even though it only maps to viewer", () => {
    // The point of the whole function: `projectRoleFromFunctions(["workflow.run"]) === "viewer"`,
    // yet an operator holding just that code must still be able to advance and assign.
    expect(projectRoleFromFunctions(["workflow.run"])).toBe("viewer");
    expect(canRunWorkflow(unscoped("workflow.run"), none)).toBe(true);
  });

  it("lets workflow.manage and the * wildcard run too", () => {
    expect(canRunWorkflow(unscoped("workflow.manage"), none)).toBe(true);
    expect(canRunWorkflow(unscoped("*"), none)).toBe(true);
  });

  it("denies read-only and unrelated design functions", () => {
    expect(canRunWorkflow(unscoped("workflow.read"), none)).toBe(false);
    expect(canRunWorkflow(unscoped("form.manage", "version.publish"), none)).toBe(false);
    expect(canRunWorkflow([], none)).toBe(false);
  });

  it("honours data scope: a role scoped elsewhere cannot run this project's cases (C3)", () => {
    const scoped = [{ functions: ["workflow.run"], scopeOrgUnitIds: ["eng"] }];
    expect(canRunWorkflow(scoped, new Set(["eng"]))).toBe(true);
    expect(canRunWorkflow(scoped, new Set(["hr", "sales"]))).toBe(false);
    // An unplaced project (no ancestors) is out of every scoped role's reach.
    expect(canRunWorkflow(scoped, none)).toBe(false);
  });

  it("unions across roles — one scoped run grant is enough", () => {
    const grants = [
      { functions: ["form.read"], scopeOrgUnitIds: [] },
      { functions: ["workflow.run"], scopeOrgUnitIds: ["eng"] },
    ];
    expect(canRunWorkflow(grants, new Set(["eng"]))).toBe(true);
    expect(canRunWorkflow(grants, new Set(["sales"]))).toBe(false);
  });
});
