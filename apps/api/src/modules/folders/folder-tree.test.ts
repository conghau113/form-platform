import { describe, expect, it } from "vitest";
import { type FolderNode, wouldCreateCycle } from "./folder-tree.js";

// a → b → c (root a)
const folders: FolderNode[] = [
  { id: "a", parentId: null },
  { id: "b", parentId: "a" },
  { id: "c", parentId: "b" },
  { id: "d", parentId: null },
];

describe("wouldCreateCycle", () => {
  it("allows moving to root (null parent)", () => {
    expect(wouldCreateCycle(folders, "b", null)).toBe(false);
  });

  it("rejects making a folder its own parent", () => {
    expect(wouldCreateCycle(folders, "a", "a")).toBe(true);
  });

  it("rejects re-parenting under a descendant", () => {
    expect(wouldCreateCycle(folders, "a", "c")).toBe(true); // c is a's grandchild
    expect(wouldCreateCycle(folders, "b", "c")).toBe(true);
  });

  it("allows moving under an unrelated subtree", () => {
    expect(wouldCreateCycle(folders, "c", "d")).toBe(false);
    expect(wouldCreateCycle(folders, "b", "d")).toBe(false);
  });

  it("does not loop on a pre-existing cycle in the data", () => {
    const looped: FolderNode[] = [
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
    ];
    expect(wouldCreateCycle(looped, "z", "x")).toBe(false);
  });
});
