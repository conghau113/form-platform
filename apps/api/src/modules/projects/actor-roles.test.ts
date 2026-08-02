import { describe, expect, it } from "vitest";
import { isReservedRoleCode, projectActorRoles, RESERVED_ROLE_CODES } from "./actor-roles.js";

describe("projectActorRoles (Phase E3a)", () => {
  it("always includes the project role, verbatim", () => {
    // Workflow definitions already in the wild gate transitions on `role: "editor"` — the bare
    // project role has to keep flowing through untouched or those cases stall.
    expect(projectActorRoles("editor", [])).toEqual(["editor"]);
    expect(projectActorRoles("owner", [])).toEqual(["owner"]);
    expect(projectActorRoles("viewer", [])).toEqual(["viewer"]);
  });

  it("adds the names of the tenant roles the user holds", () => {
    expect(projectActorRoles("viewer", ["hr", "manager"])).toEqual(["viewer", "hr", "manager"]);
  });

  it("returns no roles at all when the user has neither", () => {
    expect(projectActorRoles(null, [])).toEqual([]);
  });

  it("dedupes and drops blank names", () => {
    expect(projectActorRoles("editor", ["hr", "hr", "  ", ""])).toEqual(["editor", "hr"]);
  });

  it("trims a padded role name", () => {
    expect(projectActorRoles(null, ["  hr  "])).toEqual(["hr"]);
  });

  it("NEVER lets a tenant role named like a reserved code confer that code", () => {
    // The hole this closes: `RbacRepo.createRole` accepts any name, so a tenant admin could mint a
    // role called `assignee` or `editor`. Everyone holding it would then satisfy
    // `transition.role: "assignee"` and unlock every field gated on `viewRoles: ["editor"]`.
    expect(projectActorRoles(null, RESERVED_ROLE_CODES)).toEqual([]);
    expect(projectActorRoles("viewer", ["assignee", "editor", "hr"])).toEqual(["viewer", "hr"]);
    // …including when the name is padded, since it is trimmed before the check.
    expect(projectActorRoles(null, [" assignee "])).toEqual([]);
  });

  it("treats reserved codes as exact matches, not case-insensitive ones", () => {
    // The engine's own check is exact (`roles.includes(transition.role)`), so `Editor` satisfies
    // nothing and a client is free to name a real domain role that way.
    expect(isReservedRoleCode("editor")).toBe(true);
    expect(isReservedRoleCode("Editor")).toBe(false);
    expect(projectActorRoles(null, ["Editor"])).toEqual(["Editor"]);
  });
});
