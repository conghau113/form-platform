import { describe, expect, it } from "vitest";
import { activeNavKey, NAV_SECTIONS, visibleSections } from "./nav";

describe("shell nav catalog (§6.7 rollout + D1 function gate)", () => {
  it("shows Design to every member; Operate needs a function", () => {
    expect(visibleSections([]).map((s) => s.key)).toEqual(["design"]);
    expect(NAV_SECTIONS.map((s) => s.key)).toEqual(["design", "operate", "admin"]);
  });

  it("reveals Operate to `workflow.run` (or the * wildcard) but NOT to workflow.admin", () => {
    expect(visibleSections(["workflow.run"]).map((s) => s.key)).toEqual(["design", "operate"]);
    expect(visibleSections(["*"]).map((s) => s.key)).toEqual(["design", "operate", "admin"]);
    // `workflow.admin` does not imply `workflow.run` server-side — the section would 403.
    expect(visibleSections(["workflow.admin"]).map((s) => s.key)).toEqual(["design", "admin"]);
  });

  it("reveals Admin to any admin function (user/role/form/workflow/org.admin) or the * wildcard", () => {
    // A plain manage grant is not an admin function — no admin section.
    expect(visibleSections(["form.manage"]).map((s) => s.key)).toEqual(["design"]);
    for (const held of [
      ["user.admin"],
      ["role.admin"],
      ["form.admin"],
      ["workflow.admin"],
      ["org.admin"],
    ]) {
      expect(visibleSections(held).map((s) => s.key)).toEqual(["design", "admin"]);
    }
    // The wildcard grants every section, Operate included.
    expect(visibleSections(["*"]).map((s) => s.key)).toEqual(["design", "operate", "admin"]);
  });

  it("maps every /projects route (list + workspace + editor leaves) to Design", () => {
    expect(activeNavKey("/projects", [])).toBe("design");
    expect(activeNavKey("/projects/abc", [])).toBe("design");
    expect(activeNavKey("/projects/abc/forms/x/versions", [])).toBe("design");
  });

  it("maps /admin to Admin only when the user can see the section", () => {
    expect(activeNavKey("/admin", ["*"])).toBe("admin");
    expect(activeNavKey("/admin", [])).toBeUndefined();
  });

  it("maps /operate to Operate only for a user who can see the section", () => {
    expect(activeNavKey("/operate", ["workflow.run"])).toBe("operate");
    // Not rendered for this user ⇒ nothing to highlight.
    expect(activeNavKey("/operate", ["workflow.admin"])).toBeUndefined();
  });

  it("returns undefined for routes no section owns (Settings highlights itself)", () => {
    expect(activeNavKey("/settings", ["*"])).toBeUndefined();
  });
});
