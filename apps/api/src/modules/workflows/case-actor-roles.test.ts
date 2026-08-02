import { describe, expect, it } from "vitest";
import { mergeCaseActorRoles } from "./case-actor-roles.js";

describe("mergeCaseActorRoles (Phase E3a)", () => {
  it("unions the project roles with the cast of this case", () => {
    expect(mergeCaseActorRoles(["editor"], ["manager"], false)).toEqual(["editor", "manager"]);
  });

  it("adds `assignee` only for the person the case is actually assigned to", () => {
    expect(mergeCaseActorRoles(["viewer"], [], true)).toEqual(["viewer", "assignee"]);
    expect(mergeCaseActorRoles(["viewer"], [], false)).toEqual(["viewer"]);
  });

  it("dedupes across the two sources", () => {
    // A tenant role named `hr` and a cast row for `hr` are the same capability, not two.
    expect(mergeCaseActorRoles(["viewer", "hr"], ["hr", "manager"], false)).toEqual([
      "viewer",
      "hr",
      "manager",
    ]);
  });

  it("yields nothing when the actor holds nothing", () => {
    expect(mergeCaseActorRoles([], [], false)).toEqual([]);
  });
});
