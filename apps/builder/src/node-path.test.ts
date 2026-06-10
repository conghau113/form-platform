import type { ArrayField, FieldNode } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { nodeAtPath, patchNodeAtPath } from "./node-path";

/** An array node nested two levels deep, used across the path tests. */
function tree(): ArrayField {
  return {
    type: "array",
    name: "outer",
    label: "Outer",
    itemFields: [
      { type: "text", name: "title", label: "Title" },
      {
        type: "array",
        name: "inner",
        label: "Inner",
        itemFields: [{ type: "text", name: "city", label: "City" }],
      },
    ],
  };
}

describe("nodeAtPath", () => {
  it("resolves nodes at depth 0, 1 and 2", () => {
    const root = tree();
    expect(nodeAtPath(root, [])).toBe(root);
    expect(nodeAtPath(root, [0])).toMatchObject({ name: "title" });
    expect(nodeAtPath(root, [1])).toMatchObject({ name: "inner", type: "array" });
    expect(nodeAtPath(root, [1, 0])).toMatchObject({ name: "city" });
  });

  it("returns null for an out-of-range / stale index", () => {
    const root = tree();
    expect(nodeAtPath(root, [9])).toBeNull();
    expect(nodeAtPath(root, [0, 0])).toBeNull(); // `title` is a leaf, has no item fields
  });
});

describe("patchNodeAtPath", () => {
  it("merges into the root at depth 0", () => {
    const root = tree();
    const next = patchNodeAtPath(root, [], { label: "Renamed" }) as ArrayField;
    expect(next.label).toBe("Renamed");
    expect(next).not.toBe(root); // fresh copy
  });

  it("renames a nested item field without touching its siblings or the original", () => {
    const root = tree();
    const next = patchNodeAtPath(root, [1, 0], { label: "Town", name: "town" }) as ArrayField;

    const inner = next.itemFields[1] as ArrayField;
    expect(inner.itemFields[0]).toMatchObject({ name: "town", label: "Town" });
    // sibling untouched
    expect(next.itemFields[0]).toMatchObject({ name: "title" });
    // original tree is unchanged (pure)
    const origInner = tree().itemFields[1] as ArrayField;
    expect((root.itemFields[1] as ArrayField).itemFields[0]).toEqual(origInner.itemFields[0]);
  });

  it("is a no-op when the path runs through a non-array node", () => {
    const root = tree();
    const next = patchNodeAtPath(root, [0, 5], { label: "x" } as Record<string, unknown>);
    // `title` (path [0]) is a leaf, so descending further changes nothing structurally
    expect((next as ArrayField).itemFields[0]).toMatchObject({ name: "title", label: "Title" });
  });
});

// Type-only guard: a generic FieldNode resolves through the helpers.
const _typed: FieldNode | null = nodeAtPath(tree(), [0]);
void _typed;
