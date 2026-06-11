import { describe, expect, it } from "vitest";
import { type DropTarget, dropIntent, type Rect } from "./move-helper";

const box: Rect = { left: 0, top: 0, right: 100, bottom: 100 };
const leaf = (axis: DropTarget["axis"]): DropTarget => ({
  uid: "n",
  rect: box,
  axis,
  droppable: false,
});
const cont = (axis: DropTarget["axis"]): DropTarget => ({
  uid: "c",
  rect: box,
  axis,
  droppable: true,
});

describe("dropIntent", () => {
  it("splits a leaf at the vertical midline (before / after)", () => {
    expect(dropIntent(leaf("vertical"), { x: 50, y: 20 })).toEqual({ kind: "before", uid: "n" });
    expect(dropIntent(leaf("vertical"), { x: 50, y: 80 })).toEqual({ kind: "after", uid: "n" });
    // Exactly the midline reads as after (not < 0.5).
    expect(dropIntent(leaf("vertical"), { x: 50, y: 50 })).toEqual({ kind: "after", uid: "n" });
  });

  it("splits a leaf at the horizontal midline for row layouts", () => {
    expect(dropIntent(leaf("horizontal"), { x: 20, y: 50 })).toEqual({ kind: "before", uid: "n" });
    expect(dropIntent(leaf("horizontal"), { x: 80, y: 50 })).toEqual({ kind: "after", uid: "n" });
  });

  it("gives a droppable container edge=before/after, middle=inner", () => {
    expect(dropIntent(cont("vertical"), { x: 50, y: 10 })).toEqual({ kind: "before", uid: "c" });
    expect(dropIntent(cont("vertical"), { x: 50, y: 90 })).toEqual({ kind: "after", uid: "c" });
    expect(dropIntent(cont("vertical"), { x: 50, y: 50 })).toEqual({ kind: "inner", uid: "c" });
  });

  it("honours a custom edge fraction", () => {
    // edge 0.4 → only the outer 40% at each end is before/after.
    expect(dropIntent(cont("vertical"), { x: 50, y: 30 }, 0.4)).toEqual({
      kind: "before",
      uid: "c",
    });
    expect(dropIntent(cont("vertical"), { x: 50, y: 50 }, 0.4)).toEqual({
      kind: "inner",
      uid: "c",
    });
  });

  it("treats a degenerate (zero-length) rect as the midpoint", () => {
    const flat: Rect = { left: 0, top: 40, right: 100, bottom: 40 };
    // An empty container collapses to height 0; the middle band still reads inner.
    expect(
      dropIntent({ uid: "e", rect: flat, axis: "vertical", droppable: true }, { x: 50, y: 40 }),
    ).toEqual({
      kind: "inner",
      uid: "e",
    });
    expect(
      dropIntent({ uid: "e", rect: flat, axis: "vertical", droppable: false }, { x: 50, y: 40 }),
    ).toEqual({
      kind: "after",
      uid: "e",
    });
  });
});
