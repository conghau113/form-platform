import { describe, expect, it } from "vitest";
import {
  clearSelection,
  emptySelection,
  isSelected,
  pruneSelection,
  type SelectionState,
  select,
  selectMany,
  toggle,
} from "./selection";
import type { TreeNode } from "./tree";

const leaf = (uid: string): TreeNode => ({
  uid,
  node: { type: "text", name: uid, label: uid.toUpperCase() },
  children: [],
});

const tree: TreeNode = {
  uid: "root",
  node: { type: "form", id: "demo", title: "Demo" },
  children: [leaf("a"), leaf("b")],
};

const s = (...selected: string[]): SelectionState => ({ selected });

describe("selection", () => {
  it("select replaces with a single node", () => {
    expect(select(s("a", "b"), "c")).toEqual(s("c"));
    // already the sole selection → same reference
    const sole = s("a");
    expect(select(sole, "a")).toBe(sole);
  });

  it("toggle adds and removes", () => {
    expect(toggle(s("a"), "b")).toEqual(s("a", "b"));
    expect(toggle(s("a", "b"), "a")).toEqual(s("b"));
    expect(isSelected(s("a", "b"), "b")).toBe(true);
    expect(isSelected(s("a"), "b")).toBe(false);
  });

  it("selectMany dedupes and preserves order; no-op keeps reference", () => {
    expect(selectMany(emptySelection, ["a", "b", "a"])).toEqual(s("a", "b"));
    const existing = s("a", "b");
    expect(selectMany(existing, ["a", "b"])).toBe(existing);
  });

  it("clearSelection empties, returning the same reference when already empty", () => {
    expect(clearSelection(s("a"))).toEqual(emptySelection);
    expect(clearSelection(emptySelection)).toBe(emptySelection);
  });

  it("pruneSelection drops uids absent from the tree", () => {
    expect(pruneSelection(s("a", "gone", "b"), tree)).toEqual(s("a", "b"));
    // nothing pruned → same reference
    const live = s("a", "b");
    expect(pruneSelection(live, tree)).toBe(live);
  });
});
