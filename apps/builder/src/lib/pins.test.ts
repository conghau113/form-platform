import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePins } from "./pins";

const KEY = "test.pins";

describe("usePins", () => {
  beforeEach(() => localStorage.clear());

  it("starts empty", () => {
    const { result } = renderHook(() => usePins(KEY));
    expect(result.current.order).toEqual([]);
    expect(result.current.isPinned("a")).toBe(false);
  });

  it("toggles an id on and off", () => {
    const { result } = renderHook(() => usePins(KEY));
    act(() => result.current.toggle("a"));
    expect(result.current.isPinned("a")).toBe(true);
    expect(result.current.pinned.has("a")).toBe(true);
    act(() => result.current.toggle("a"));
    expect(result.current.isPinned("a")).toBe(false);
  });

  it("preserves pin order", () => {
    const { result } = renderHook(() => usePins(KEY));
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));
    expect(result.current.order).toEqual(["a", "b"]);
  });

  it("persists to localStorage and rehydrates", () => {
    const first = renderHook(() => usePins(KEY));
    act(() => first.result.current.toggle("x"));
    // A fresh hook (e.g. after reload) reads the persisted set.
    const second = renderHook(() => usePins(KEY));
    expect(second.result.current.isPinned("x")).toBe(true);
  });

  it("ignores corrupt storage", () => {
    localStorage.setItem("builder.workbench.test.pins", "not json");
    const { result } = renderHook(() => usePins(KEY));
    expect(result.current.order).toEqual([]);
  });
});
