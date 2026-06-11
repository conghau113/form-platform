import { describe, expect, it } from "vitest";
import { copyNodes, emptyClipboard, hasContent, pasteAfter, pasteInto } from "./clipboard";
import type { SelectionState } from "./selection";
import { collectNames, findNode, type InsertGuard, type TreeNode } from "./tree";

function n(uid: string, props: Record<string, unknown>, children: TreeNode[] = []): TreeNode {
  return { uid, node: props as TreeNode["node"], children };
}
const leaf = (uid: string, name = uid) => n(uid, { type: "text", name });

/** form > [ text:a, card:c1 > [ text:b, text:e ], text:d ] */
function sample(): TreeNode {
  return n("root", { type: "form", id: "demo", title: "Demo" }, [
    leaf("a"),
    n("c1", { type: "card", title: "Card" }, [leaf("b"), leaf("e")]),
    leaf("d"),
  ]);
}
const sel = (...selected: string[]): SelectionState => ({ selected });

const uidsOf = (node: TreeNode): string[] => [node.uid, ...node.children.flatMap(uidsOf)];

describe("clipboard copy", () => {
  it("snapshots only the top-most selected subtrees, preserving uids/names", () => {
    const root = sample();
    // b is inside c1 → c1 wins, b is not copied separately
    const clip = copyNodes(root, sel("c1", "b", "a"));
    expect(clip.nodes.map((x) => x.uid)).toEqual(["c1", "a"]);
    expect(hasContent(clip)).toBe(true);

    // detached deep copy: editing the source later cannot reach the snapshot
    const card = clip.nodes[0];
    expect(card.children.map((c) => c.uid)).toEqual(["b", "e"]);
    expect(card).not.toBe(findNode(root, "c1"));
  });

  it("an empty selection yields an empty clipboard", () => {
    expect(copyNodes(sample(), sel())).toEqual(emptyClipboard);
    expect(hasContent(emptyClipboard)).toBe(false);
  });
});

describe("clipboard paste", () => {
  it("pasteInto appends fresh uids and unique names", () => {
    const root = sample();
    const clip = copyNodes(root, sel("c1"));
    const next = pasteInto(root, "root", clip);

    const pasted = next.children[next.children.length - 1];
    expect(pasted.node.type).toBe("card");
    // every uid is brand new
    for (const uid of uidsOf(pasted)) expect(findNode(root, uid)).toBeNull();
    // names of the named descendants were uniquified against the live tree
    expect(collectNames(next)).toEqual(new Set(["a", "b", "e", "d", "b2", "e2"]));
  });

  it("pasteAfter inserts in order right after the sibling", () => {
    const root = sample();
    const clip = copyNodes(root, sel("a", "d")); // two leaves
    const next = pasteAfter(root, "a", clip);

    // a, <copy of a>, <copy of d>, c1, d
    const order = next.children.map((c) => c.uid);
    expect(order[0]).toBe("a");
    expect(order.slice(-2)).toEqual(["c1", "d"]);
    expect(order).toHaveLength(5);
    expect(collectNames(next)).toEqual(new Set(["a", "b", "e", "d", "a2", "d2"]));
  });

  it("respects the insert guard and no-ops an empty clipboard", () => {
    const root = sample();
    const clip = copyNodes(root, sel("a"));
    const noLeavesInCard: InsertGuard = (parent) => parent.node.type !== "card";
    expect(pasteInto(root, "c1", clip, noLeavesInCard)).toBe(root);
    expect(pasteAfter(root, "a", emptyClipboard)).toBe(root);
    // a permitted paste still works and lands inside the card (b, e, <copy of a>)
    const ok = pasteInto(root, "c1", clip);
    const card = findNode(ok, "c1") as TreeNode;
    expect(card.children).toHaveLength(3);
    expect(card.children[2].node.type).toBe("text");
  });
});
