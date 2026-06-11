import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { isBoolean, oneOf, usePersistentState } from "./persist";

const KEY = "builder.workbench.test";

describe("usePersistentState", () => {
  beforeEach(() => localStorage.clear());

  it("starts from the fallback and persists changes", () => {
    const { result } = renderHook(() => usePersistentState("test", "a", oneOf("a", "b")));
    expect(result.current[0]).toBe("a");
    act(() => result.current[1]("b"));
    expect(result.current[0]).toBe("b");
    expect(localStorage.getItem(KEY)).toBe('"b"');
  });

  it("restores a stored value that passes the guard", () => {
    localStorage.setItem(KEY, '"b"');
    const { result } = renderHook(() => usePersistentState("test", "a", oneOf("a", "b")));
    expect(result.current[0]).toBe("b");
  });

  it("ignores stored values the guard rejects (stale unions, wrong types)", () => {
    localStorage.setItem(KEY, '"removed-mode"');
    const { result } = renderHook(() => usePersistentState("test", "a", oneOf("a", "b")));
    expect(result.current[0]).toBe("a");
  });

  it("ignores corrupt (non-JSON) stored values", () => {
    localStorage.setItem(KEY, "not json at all");
    const { result } = renderHook(() => usePersistentState("test", true, isBoolean));
    expect(result.current[0]).toBe(true);
  });
});
