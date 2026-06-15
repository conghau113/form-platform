import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  append,
  clone,
  collectNames,
  contains,
  findNode,
  findParent,
  type InsertGuard,
  insertAfter,
  insertBefore,
  keyboardMove,
  move,
  patchNode,
  remove,
  setColSpan,
  type TreeNode,
  topMostUids,
} from "./tree";

/** Terse node factory: leaf("a") or branch("card-1", {type:"card"}, [children]). */
function n(uid: string, props: Record<string, unknown>, children: TreeNode[] = []): TreeNode {
  return { uid, node: props as TreeNode["node"], children };
}
const leaf = (uid: string, name = uid) => n(uid, { type: "text", name, label: name.toUpperCase() });

/** form > [ text:a, card:c1 > [ text:b, array:arr > [ text:c ] ], text:d ] */
function sample(): TreeNode {
  return n("root", { type: "form", id: "demo", title: "Demo" }, [
    leaf("a"),
    n("c1", { type: "card", title: "Card" }, [
      leaf("b"),
      n("arr", { type: "array", name: "rows", label: "Rows" }, [leaf("c")]),
    ]),
    leaf("d"),
  ]);
}

describe("tree queries", () => {
  it("finds nodes, parents and ancestor paths at any depth", () => {
    const root = sample();
    expect(findNode(root, "c")?.uid).toBe("c");
    expect(findNode(root, "nope")).toBeNull();

    expect(findParent(root, "a")).toMatchObject({ index: 0 });
    expect(findParent(root, "c")?.parent.uid).toBe("arr");
    expect(findParent(root, "root")).toBeNull();

    expect(ancestorsOf(root, "c")?.map((x) => x.uid)).toEqual(["root", "c1", "arr", "c"]);
    expect(ancestorsOf(root, "nope")).toBeNull();

    expect(contains(findNode(root, "c1") as TreeNode, "c")).toBe(true);
    expect(contains(findNode(root, "c1") as TreeNode, "d")).toBe(false);

    expect(collectNames(root)).toEqual(new Set(["a", "b", "c", "d", "rows"]));
  });

  it("filters a selection to its top-most nodes (parent over its children)", () => {
    const root = sample();
    // c1 + its descendants b/arr/c selected → only c1 survives, plus the unrelated a.
    expect(topMostUids(root, ["a", "c1", "b", "arr", "c"])).toEqual(["a", "c1"]);
    // siblings are all kept; an absent uid is dropped.
    expect(topMostUids(root, ["a", "d", "gone"])).toEqual(["a", "d"]);
  });
});

describe("tree ops", () => {
  it("appends into a container, path-copying only the spine", () => {
    const root = sample();
    const child = leaf("x");
    const next = append(root, "c1", child);

    expect(findParent(next, "x")?.parent.uid).toBe("c1");
    expect(next).not.toBe(root);
    // Untouched siblings keep reference identity (structural sharing).
    expect(next.children[0]).toBe(root.children[0]);
    expect(next.children[2]).toBe(root.children[2]);
    // The original tree is untouched.
    expect(findNode(root, "x")).toBeNull();
  });

  it("inserts before/after a sibling at depth", () => {
    const root = sample();
    const before = insertBefore(root, "b", leaf("x"));
    expect(findParent(before, "x")).toMatchObject({ index: 0 });
    const after = insertAfter(root, "b", leaf("y"));
    expect(findParent(after, "y")).toMatchObject({ index: 1 });
    expect(findParent(after, "y")?.parent.uid).toBe("c1");
  });

  it("returns the SAME root reference for every invalid op", () => {
    const root = sample();
    const x = leaf("x");
    expect(append(root, "nope", x)).toBe(root); // unknown parent
    expect(insertBefore(root, "nope", x)).toBe(root); // unknown sibling
    expect(insertBefore(root, "root", x)).toBe(root); // nothing beside the root
    expect(append(root, "c1", n("r2", { type: "form", id: "x", title: "X" }))).toBe(root); // no second root
    expect(remove(root, "root")).toBe(root); // root not removable
    expect(remove(root, "nope")).toBe(root);
    expect(move(root, "root", { kind: "append", uid: "c1" })).toBe(root); // root not movable
    expect(move(root, "c1", { kind: "append", uid: "arr" })).toBe(root); // into own subtree
    expect(move(root, "a", { kind: "before", uid: "a" })).toBe(root); // onto itself
    expect(patchNode(root, "nope", { label: "X" })).toBe(root);
  });

  it("vetoes inserts and moves through the guard", () => {
    const root = sample();
    const noCards: InsertGuard = (parent) => parent.node.type !== "card";
    expect(append(root, "c1", leaf("x"), noCards)).toBe(root);
    expect(insertAfter(root, "b", leaf("x"), noCards)).toBe(root);
    expect(move(root, "a", { kind: "append", uid: "c1" }, noCards)).toBe(root);
    // The same op without the guard succeeds.
    expect(append(root, "c1", leaf("x"))).not.toBe(root);
  });

  it("removes a nested node without touching unrelated branches", () => {
    const root = sample();
    const next = remove(root, "b");
    expect(findNode(next, "b")).toBeNull();
    expect(findNode(next, "c")).not.toBeNull();
    expect(next.children[0]).toBe(root.children[0]);
  });

  it("moves a node across parents (before / after / append)", () => {
    const root = sample();

    const intoCard = move(root, "a", { kind: "append", uid: "c1" });
    expect(findParent(intoCard, "a")?.parent.uid).toBe("c1");
    expect(intoCard.children.map((c) => c.uid)).toEqual(["c1", "d"]);

    const beforeC = move(root, "d", { kind: "before", uid: "c" });
    expect(findParent(beforeC, "d")?.parent.uid).toBe("arr");
    expect(findParent(beforeC, "d")).toMatchObject({ index: 0 });

    const afterA = move(root, "b", { kind: "after", uid: "a" });
    expect(afterA.children.map((c) => c.uid)).toEqual(["a", "b", "c1", "d"]);
  });

  it("reorders within the same parent without losing nodes", () => {
    const root = sample();
    const next = move(root, "d", { kind: "before", uid: "a" });
    expect(next.children.map((c) => c.uid)).toEqual(["d", "a", "c1"]);
  });

  it("keyboard-reorders (D6): up/down swap siblings, in/out re-parent", () => {
    const root = sample(); // top level: [a, c1, d]
    // ↑ on c1 → swaps before a.
    expect(keyboardMove(root, "c1", "up").children.map((c) => c.uid)).toEqual(["c1", "a", "d"]);
    // ↓ on a → swaps after c1.
    expect(keyboardMove(root, "a", "down").children.map((c) => c.uid)).toEqual(["c1", "a", "d"]);
    // Tab (in) on d → indents into the previous sibling c1 (a droppable card).
    const indented = keyboardMove(root, "d", "in");
    expect(findParent(indented, "d")?.parent.uid).toBe("c1");
    expect(indented.children.map((c) => c.uid)).toEqual(["a", "c1"]);
    // Shift-Tab (out) on b → outdents to just after its parent c1, in the root.
    const out = keyboardMove(root, "b", "out");
    expect(out.children.map((c) => c.uid)).toEqual(["a", "c1", "b", "d"]);
  });

  it("keyboard-reorder no-ops return the SAME root and honor the guard", () => {
    const root = sample();
    expect(keyboardMove(root, "a", "up")).toBe(root); // already first
    expect(keyboardMove(root, "d", "down")).toBe(root); // already last
    expect(keyboardMove(root, "a", "out")).toBe(root); // parent is the root
    expect(keyboardMove(root, "a", "in")).toBe(root); // no previous sibling
    expect(keyboardMove(root, "root", "down")).toBe(root); // the root never moves
    const noCards: InsertGuard = (parent) => parent.node.type !== "card";
    expect(keyboardMove(root, "d", "in", noCards)).toBe(root); // can't indent into a card
  });

  it("patches schema props shallowly, keeping structure and siblings", () => {
    const root = sample();
    const next = patchNode(root, "b", { label: "Renamed" });
    expect((findNode(next, "b")?.node as { label?: string }).label).toBe("Renamed");
    expect(findNode(next, "b")?.children).toEqual([]);
    expect(next.children[0]).toBe(root.children[0]);
    // patching the root's form props works too
    const titled = patchNode(root, "root", { title: "New title" });
    expect((titled.node as { title: string }).title).toBe("New title");
  });
});

describe("clone", () => {
  it("regenerates every uid and uniquifies every named descendant", () => {
    const root = sample();
    const card = findNode(root, "c1") as TreeNode;
    const copy = clone(card, collectNames(root));

    // fresh uids everywhere
    const uids = new Set<string>();
    const walk = (t: TreeNode) => {
      uids.add(t.uid);
      for (const c of t.children) walk(c);
    };
    walk(copy);
    for (const old of ["c1", "b", "arr", "c"]) expect(uids.has(old)).toBe(false);

    // names regenerated against the taken pool; nameless card untouched
    expect(copy.node).toMatchObject({ type: "card", title: "Card" });
    const names = collectNames(copy);
    expect(names.has("b")).toBe(false);
    expect(names.has("rows")).toBe(false);
    expect(names.size).toBe(3); // b', rows', c' all renamed and mutually unique

    // the source tree is untouched
    expect(collectNames(root)).toEqual(new Set(["a", "b", "c", "d", "rows"]));
  });

  it("derives counter-style names (text1 -> text2)", () => {
    const node = leaf("u1", "text1");
    const copy = clone(node, new Set(["text1"]));
    expect((copy.node as { name: string }).name).toBe("text2");
  });
});

describe("setColSpan (D8 drag-resize write-path)", () => {
  const layoutOf = (root: TreeNode, uid: string) =>
    (findNode(root, uid)?.node as { layout?: { colSpan?: Record<string, number> } }).layout;

  it("creates the layout/colSpan slot on a field that never had one", () => {
    // A select with NO `layout` key — the case the original `\"layout\" in node` guard wrongly skipped.
    const root = n("root", { type: "form", id: "d", title: "D" }, [
      n("s1", { type: "select", name: "country", label: "Country" }),
    ]);
    const next = setColSpan(root, "s1", "lg", 6);
    expect(layoutOf(next, "s1")).toEqual({ colSpan: { lg: 6 } });
  });

  it("merges with an existing colSpan and preserves other layout keys", () => {
    const root = n("root", { type: "form", id: "d", title: "D" }, [
      n("t1", { type: "text", name: "a", layout: { colSpan: { lg: 6 }, hideOnMobile: true } }),
    ]);
    const next = setColSpan(root, "t1", "md", 8);
    expect(layoutOf(next, "t1")).toEqual({ colSpan: { lg: 6, md: 8 }, hideOnMobile: true });
  });

  it("is a no-op (same root) for the form root, a layout-less sub-container, or an unknown uid", () => {
    const root = n("root", { type: "form", id: "d", title: "D" }, [
      n("tabs", { type: "tabs" }, [n("p1", { type: "tab-pane", label: "P" }, [leaf("x")])]),
    ]);
    expect(setColSpan(root, "root", "lg", 6)).toBe(root); // form root has no layout
    expect(setColSpan(root, "p1", "lg", 6)).toBe(root); // tab-pane has no layout
    expect(setColSpan(root, "nope", "lg", 6)).toBe(root); // unknown uid
  });
});
