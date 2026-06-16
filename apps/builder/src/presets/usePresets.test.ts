import type { Preset } from "@org/form-schema";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUILTIN_PRESETS } from "./builtin";
import { usePresets } from "./usePresets";

const userPreset: Preset = { id: "user-1", fieldType: "number", name: "Currency", patch: {} };

const ok = (json: unknown) => ({ ok: true, statusText: "OK", json: async () => json });

/** Route by HTTP method: GET → the preset list, POST → the saved preset, else empty. */
function mockFetch({ list = [] as Preset[], saved = userPreset, listOk = true } = {}) {
  const fn = vi.fn((_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return Promise.resolve(
        listOk ? ok(list) : { ok: false, statusText: "Boom", json: async () => ({}) },
      );
    }
    if (method === "POST") return Promise.resolve(ok(saved));
    return Promise.resolve(ok({}));
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePresets", () => {
  it("ships the built-ins and loads user presets on mount", async () => {
    mockFetch({ list: [userPreset] });
    const { result } = renderHook(() => usePresets());
    expect(result.current.builtin).toEqual(BUILTIN_PRESETS);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual([userPreset]);
  });

  it("degrades to an empty user list when the load fails", async () => {
    mockFetch({ listOk: false });
    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual([]);
  });

  it("save upserts the server's copy at the front", async () => {
    mockFetch({ list: [], saved: userPreset });
    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.save(userPreset);
    });
    expect(result.current.user).toEqual([userPreset]);
  });

  it("remove drops the preset by id", async () => {
    mockFetch({ list: [userPreset] });
    const { result } = renderHook(() => usePresets());
    await waitFor(() => expect(result.current.user).toHaveLength(1));
    await act(async () => {
      await result.current.remove(userPreset.id);
    });
    expect(result.current.user).toEqual([]);
  });

  it("reloads the user list when projectId changes", async () => {
    const fetchFn = mockFetch({ list: [userPreset] });
    const { result, rerender } = renderHook(({ pid }: { pid?: string }) => usePresets(pid), {
      initialProps: { pid: undefined as string | undefined },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const firstCalls = fetchFn.mock.calls.length;
    rerender({ pid: "proj-1" });
    await waitFor(() => expect(fetchFn.mock.calls.length).toBeGreaterThan(firstCalls));
    expect(fetchFn).toHaveBeenLastCalledWith(
      expect.stringContaining("projectId=proj-1"),
      expect.anything(),
    );
  });

  it("promote swaps in the promoted (now global) preset", async () => {
    const projectPreset: Preset = { ...userPreset, scope: "project", projectId: "proj-1" };
    const promoted: Preset = { ...userPreset, scope: "global" };
    const fn = vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return Promise.resolve(ok([projectPreset]));
      if (method === "POST" && url.endsWith("/promote")) return Promise.resolve(ok(promoted));
      return Promise.resolve(ok({}));
    });
    vi.stubGlobal("fetch", fn);
    const { result } = renderHook(() => usePresets("proj-1"));
    await waitFor(() => expect(result.current.user).toHaveLength(1));
    await act(async () => {
      await result.current.promote(userPreset.id);
    });
    expect(result.current.user).toEqual([promoted]);
  });
});
