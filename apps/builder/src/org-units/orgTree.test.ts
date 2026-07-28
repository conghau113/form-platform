import { describe, expect, it } from "vitest";
import type { OrgUnit } from "./client";
import { buildOrgTree } from "./orgTree";

const unit = (id: string, parentId: string | null, order = 0): OrgUnit => ({
  id,
  tenantId: "t",
  parentId,
  name: id,
  kind: null,
  order,
  createdAt: "",
});

describe("buildOrgTree", () => {
  it("nests children under their parent, ordered by order then name", () => {
    const tree = buildOrgTree([
      unit("hr", null, 1),
      unit("sales", null, 0),
      unit("eng", "hr"),
      unit("team", "eng"),
    ]);
    expect(tree.map((n) => n.key)).toEqual(["sales", "hr"]); // order 0 before 1
    const hr = tree.find((n) => n.key === "hr");
    expect(hr?.children.map((n) => n.key)).toEqual(["eng"]);
    expect(hr?.children[0].children.map((n) => n.key)).toEqual(["team"]);
  });

  it("treats a unit whose parent is absent as a root", () => {
    const tree = buildOrgTree([unit("orphan", "ghost")]);
    expect(tree.map((n) => n.key)).toEqual(["orphan"]);
  });

  it("does not re-visit a node reachable twice (defensive; server keeps the tree acyclic)", () => {
    // A reachable cycle: root → a → b → a. `b`'s child `a` is already seen, so it isn't re-added.
    const tree = buildOrgTree([unit("root", null), unit("a", "root"), unit("b", "a"), unit("a", "b")]);
    const keys: string[] = [];
    const walk = (nodes: typeof tree) => {
      for (const n of nodes) {
        keys.push(n.key);
        walk(n.children);
      }
    };
    walk(tree);
    // Each id appears at most once (terminates; no infinite recursion).
    expect(new Set(keys).size).toBe(keys.length);
  });
});
