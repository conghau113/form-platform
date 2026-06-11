import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  createHistory,
  type History,
  historyEntries,
  jumpTo,
  present,
  pushHistory,
  redoHistory,
  resetHistory,
  undoHistory,
} from "./history";

const build = (): History<number> => {
  let h = createHistory(0, "init");
  h = pushHistory(h, 1, "one");
  h = pushHistory(h, 2, "two");
  return h;
};

describe("pure history", () => {
  it("records the present and exposes undo/redo bounds", () => {
    const h = build();
    expect(present(h)).toBe(2);
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
    expect(historyEntries(h).map((e) => e.label)).toEqual(["init", "one", "two"]);
  });

  it("undo and redo walk the cursor without truncating", () => {
    const h = build();
    const back = undoHistory(undoHistory(h));
    expect(present(back)).toBe(0);
    expect(canRedo(back)).toBe(true);
    expect(present(redoHistory(back))).toBe(1);
    // already at the ends → same reference
    expect(undoHistory(back)).toBe(back);
    expect(redoHistory(h)).toBe(h);
  });

  it("pushing after an undo truncates the redo tail", () => {
    const h = undoHistory(build()); // present = 1
    const branched = pushHistory(h, 9, "nine");
    expect(present(branched)).toBe(9);
    expect(canRedo(branched)).toBe(false);
    expect(historyEntries(branched).map((e) => e.value)).toEqual([0, 1, 9]);
  });

  it("pushing the current present is a no-op", () => {
    const h = build();
    expect(pushHistory(h, 2)).toBe(h);
  });

  it("jumpTo moves the present and ignores out-of-range / current indices", () => {
    const h = build();
    expect(present(jumpTo(h, 0))).toBe(0);
    expect(canRedo(jumpTo(h, 0))).toBe(true);
    expect(jumpTo(h, 2)).toBe(h); // already the cursor
    expect(jumpTo(h, -1)).toBe(h);
    expect(jumpTo(h, 99)).toBe(h);
  });

  it("resetHistory starts a fresh single-entry timeline", () => {
    const h = resetHistory(42, "loaded");
    expect(present(h)).toBe(42);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(historyEntries(h)).toHaveLength(1);
  });
});
