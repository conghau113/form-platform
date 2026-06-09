import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useHistory } from "./history";

describe("useHistory", () => {
  it("records steps and undoes/redoes them", () => {
    const { result } = renderHook(() => useHistory(0));

    expect(result.current.present).toBe(0);
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.set(1));
    act(() => result.current.set(2));
    expect(result.current.present).toBe(2);

    act(() => result.current.undo());
    expect(result.current.present).toBe(1);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(result.current.present).toBe(2);
  });

  it("clears the redo stack on a new edit", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));
    act(() => result.current.undo());
    expect(result.current.present).toBe("a");
    act(() => result.current.set("c"));
    expect(result.current.canRedo).toBe(false);
    expect(result.current.present).toBe("c");
  });

  it("reset() replaces the present and drops history", () => {
    const { result } = renderHook(() => useHistory(1));
    act(() => result.current.set(2));
    act(() => result.current.reset(99));
    expect(result.current.present).toBe(99);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
