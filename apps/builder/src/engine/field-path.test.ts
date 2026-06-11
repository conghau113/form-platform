import type { ArrayField, CardField, FieldNode } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { nodeAtPath, patchNodeAtPath } from "./field-path";

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

/** An array whose row holds a card (container) wrapping a leaf — the case the old
 *  node-path helper dropped edits on. */
function arrayWithCard(): ArrayField {
  return {
    type: "array",
    name: "jobs",
    itemFields: [
      {
        type: "card",
        title: "Details",
        children: [{ type: "text", name: "role", label: "Role" }],
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

  it("descends through a container's children, not just array item fields", () => {
    const root = arrayWithCard();
    expect(nodeAtPath(root, [0])).toMatchObject({ type: "card" });
    expect(nodeAtPath(root, [0, 0])).toMatchObject({ name: "role", type: "text" });
  });

  it("returns null for an out-of-range / stale index", () => {
    const root = tree();
    expect(nodeAtPath(root, [9])).toBeNull();
    expect(nodeAtPath(root, [0, 0])).toBeNull(); // `title` is a leaf, has no children
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

  it("patches a leaf nested under a container inside an array (the old drop bug)", () => {
    const root = arrayWithCard();
    const next = patchNodeAtPath(root, [0, 0], { label: "Job role" }) as ArrayField;
    const card = next.itemFields[0] as CardField;
    expect(card.children[0]).toMatchObject({ name: "role", label: "Job role" });
  });

  it("is a no-op when the path runs through a childless leaf", () => {
    const root = tree();
    const next = patchNodeAtPath(root, [0, 5], { label: "x" });
    expect((next as ArrayField).itemFields[0]).toMatchObject({ name: "title", label: "Title" });
  });
});

// Type-only guard: a generic FieldNode resolves through the helpers.
const _typed: FieldNode | null = nodeAtPath(tree(), [0]);
void _typed;
