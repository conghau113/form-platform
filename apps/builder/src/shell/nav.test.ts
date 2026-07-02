import { describe, expect, it } from "vitest";
import { activeNavKey, NAV_SECTIONS, visibleSections } from "./nav";

describe("shell nav catalog (§6.7 rollout)", () => {
  it("shows only the Design section today; Operate/Admin stay hidden", () => {
    const keys = visibleSections().map((s) => s.key);
    expect(keys).toEqual(["design"]);
    // The hidden sections are still in the catalog so later phases just flip `enabled`.
    expect(NAV_SECTIONS.map((s) => s.key)).toEqual(["design", "operate", "admin"]);
  });

  it("maps every /projects route (list + workspace + editor leaves) to Design", () => {
    expect(activeNavKey("/projects")).toBe("design");
    expect(activeNavKey("/projects/abc")).toBe("design");
    expect(activeNavKey("/projects/abc/forms/x/versions")).toBe("design");
  });

  it("returns undefined for routes no section owns (Settings highlights itself)", () => {
    expect(activeNavKey("/settings")).toBeUndefined();
    // A hidden section's path must not match (it isn't rendered).
    expect(activeNavKey("/admin")).toBeUndefined();
  });
});
