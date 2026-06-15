import { describe, expect, it } from "vitest";
import { metaGuard } from "../field-registry";
import {
  axisOf,
  canDrop,
  type DragSource,
  type DropResult,
  intentToMoveTarget,
  performDrop,
} from "./dragon";
import type { DropIntent } from "./move-helper";
import { findNode, findParent, type TreeNode } from "./tree";

function n(uid: string, props: Record<string, unknown>, children: TreeNode[] = []): TreeNode {
  return { uid, node: props as TreeNode["node"], children };
}
const leaf = (uid: string, name = uid) => n(uid, { type: "text", name, label: name.toUpperCase() });

/** form > [ text a, text z, card c1 > [ text b ], grid g1 > [ text e, text f ],
 *          tabs t1 > [ tab-pane p1 > [ text d ] ] ] */
function sample(): TreeNode {
  return n("root", { type: "form", id: "demo", title: "Demo" }, [
    leaf("a"),
    leaf("z"),
    n("c1", { type: "card", title: "Card" }, [leaf("b")]),
    n("g1", { type: "grid", cols: 2 }, [leaf("e"), leaf("f")]),
    n("t1", { type: "tabs" }, [n("p1", { type: "tab-pane", label: "P" }, [leaf("d")])]),
  ]);
}

/** A minimal createNode for palette drags: counter-style unique name, fresh uid. */
const make = (type: string, taken: ReadonlySet<string>): TreeNode => {
  let i = 1;
  let name = `${type}${i}`;
  while (taken.has(name)) name = `${type}${++i}`;
  return {
    uid: `new-${name}`,
    node: { type, name, label: type } as TreeNode["node"],
    children: [],
  };
};
const create = (fieldType: string): DragSource => ({
  kind: "create",
  fieldType: fieldType as never,
});
const beside = (kind: "before" | "after" | "inner", uid: string): DropIntent =>
  ({ kind, uid }) as DropIntent;
/** Narrow a drop result that the test expects to have succeeded. */
function done(r: DropResult | null): DropResult {
  if (!r) throw new Error("expected a successful drop");
  return r;
}

describe("axisOf", () => {
  it("is horizontal for grid/space, vertical otherwise", () => {
    expect(axisOf("grid")).toBe("horizontal");
    expect(axisOf("space")).toBe("horizontal");
    expect(axisOf("card")).toBe("vertical");
    expect(axisOf("form")).toBe("vertical");
  });
});

describe("intentToMoveTarget", () => {
  it("maps inner→append and keeps before/after", () => {
    expect(intentToMoveTarget(beside("inner", "c1"))).toEqual({ kind: "append", uid: "c1" });
    expect(intentToMoveTarget(beside("before", "a"))).toEqual({ kind: "before", uid: "a" });
    expect(intentToMoveTarget(beside("after", "a"))).toEqual({ kind: "after", uid: "a" });
  });
});

describe("canDrop", () => {
  const root = sample();

  it("accepts a palette field as a sibling or inside a droppable container", () => {
    expect(canDrop(root, create("text"), beside("before", "a"))).toBe(true); // beside → into form
    expect(canDrop(root, create("text"), beside("inner", "c1"))).toBe(true); // into the card
  });

  it("rejects a palette field that the parent's meta forbids", () => {
    // tabs only accept tab-pane.
    expect(canDrop(root, create("text"), beside("inner", "t1"))).toBe(false);
    // a tab-pane may only live under tabs, not a card.
    expect(canDrop(root, create("tab-pane"), beside("inner", "c1"))).toBe(false);
    expect(canDrop(root, create("tab-pane"), beside("inner", "t1"))).toBe(true);
  });

  it("rejects illegal moves (root, onto self, into own subtree)", () => {
    expect(canDrop(root, { kind: "move", uids: ["root"] }, beside("after", "a"))).toBe(false);
    expect(canDrop(root, { kind: "move", uids: ["a"] }, beside("after", "a"))).toBe(false);
    expect(canDrop(root, { kind: "move", uids: ["c1"] }, beside("inner", "b"))).toBe(false);
    expect(canDrop(root, { kind: "move", uids: ["a"] }, beside("inner", "c1"))).toBe(true);
  });
});

describe("performDrop", () => {
  it("creates a node before/after a sibling or inside a container", () => {
    const root = sample();
    const guard = metaGuard();

    const before = performDrop(root, create("text"), beside("before", "a"), guard, make);
    expect(before?.next.children[0].node).toMatchObject({ type: "text", name: "text1" });
    expect(before?.selected).toEqual(["new-text1"]);

    const inner = done(performDrop(root, create("number"), beside("inner", "c1"), guard, make));
    expect(findNode(inner.next, "new-number1")).not.toBeNull();
    expect(findParent(inner.next, "new-number1")?.parent.uid).toBe("c1");
  });

  it("appends a palette field dropped INNER onto the form root (empty-form drop zone)", () => {
    const empty = n("root", { type: "form", id: "demo", title: "Demo" }, []);
    expect(canDrop(empty, create("text"), beside("inner", "root"))).toBe(true);
    const res = done(
      performDrop(empty, create("text"), beside("inner", "root"), metaGuard(), make),
    );
    expect(res.next.children.map((c) => c.node.type)).toEqual(["text"]);
    expect(findParent(res.next, res.selected[0])?.parent.uid).toBe("root");
  });

  it("returns null when a create is rejected by the guard", () => {
    const root = sample();
    expect(performDrop(root, create("text"), beside("inner", "t1"), metaGuard(), make)).toBeNull();
  });

  it("moves a single node and reports it selected", () => {
    const root = sample();
    const res = done(
      performDrop(root, { kind: "move", uids: ["a"] }, beside("inner", "c1"), metaGuard(), make),
    );
    expect(findParent(res.next, "a")?.parent.uid).toBe("c1");
    expect(res.selected).toEqual(["a"]);
  });

  it("moves a multi-selection preserving order (after / before / inner)", () => {
    const root = sample();
    const guard = metaGuard();
    const src: DragSource = { kind: "move", uids: ["a", "z"] };

    const after = done(performDrop(root, src, beside("after", "b"), guard, make));
    expect(findNode(after.next, "c1")?.children.map((c) => c.uid)).toEqual(["b", "a", "z"]);

    const before = done(performDrop(root, src, beside("before", "b"), guard, make));
    expect(findNode(before.next, "c1")?.children.map((c) => c.uid)).toEqual(["a", "z", "b"]);

    const inner = done(performDrop(root, src, beside("inner", "c1"), guard, make));
    expect(findNode(inner.next, "c1")?.children.map((c) => c.uid)).toEqual(["b", "a", "z"]);
  });

  it("returns null when nothing moved (whole selection rejected)", () => {
    const root = sample();
    // text can't go inside tabs.
    expect(
      performDrop(root, { kind: "move", uids: ["a"] }, beside("inner", "t1"), metaGuard(), make),
    ).toBeNull();
  });
});
