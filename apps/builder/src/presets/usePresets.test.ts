import type { Preset } from "@org/form-schema";
import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHookWithQuery } from "../query/testing";
import { BUILTIN_PRESETS } from "./builtin";
import { usePresets } from "./usePresets";

const userPreset: Preset = { id: "user-1", fieldType: "number", name: "Currency", patch: {} };

const ok = (json: unknown) => ({ ok: true, statusText: "OK", json: async () => json });

/**
 * A tiny stateful fake `/presets` server. Because the hook now `invalidateQueries` after every
 * mutation (R4), a write must be visible to the *next* GET — so the mock holds real state instead
 * of routing by method alone. `listOk: false` simulates a failing initial load.
 */
function fakeServer({ initial = [] as Preset[], listOk = true } = {}) {
  let state = [...initial];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return Promise.resolve(
        listOk ? ok(state) : { ok: false, statusText: "Boom", json: async () => ({}) },
      );
    }
    if (method === "DELETE") {
      const id = decodeURIComponent(url.split("/").pop() ?? "");
      state = state.filter((p) => p.id !== id);
      return Promise.resolve(ok({}));
    }
    if (method === "POST" && url.endsWith("/promote")) {
      const parts = url.split("/");
      const id = decodeURIComponent(parts[parts.length - 2] ?? "");
      const promoted = { ...userPreset, scope: "global" } as Preset;
      state = state.map((p) => (p.id === id ? promoted : p));
      return Promise.resolve(ok(promoted));
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as Preset;
      state = [body, ...state.filter((p) => p.id !== body.id)];
      return Promise.resolve(ok(body));
    }
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
    fakeServer({ initial: [userPreset] });
    const { result } = renderHookWithQuery(() => usePresets());
    expect(result.current.builtin).toEqual(BUILTIN_PRESETS);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual([userPreset]);
  });

  it("degrades to an empty user list when the load fails", async () => {
    fakeServer({ listOk: false });
    const { result } = renderHookWithQuery(() => usePresets());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual([]);
  });

  it("save upserts the server's copy at the front", async () => {
    fakeServer({ initial: [] });
    const { result } = renderHookWithQuery(() => usePresets());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.save(userPreset);
    });
    await waitFor(() => expect(result.current.user).toEqual([userPreset]));
  });

  it("remove drops the preset by id", async () => {
    fakeServer({ initial: [userPreset] });
    const { result } = renderHookWithQuery(() => usePresets());
    await waitFor(() => expect(result.current.user).toHaveLength(1));
    await act(async () => {
      await result.current.remove(userPreset.id);
    });
    await waitFor(() => expect(result.current.user).toEqual([]));
  });

  it("reloads the user list when projectId changes", async () => {
    const fetchFn = fakeServer({ initial: [userPreset] });
    const { result, rerender } = renderHookWithQuery(
      ({ pid }: { pid?: string }) => usePresets(pid),
      { initialProps: { pid: undefined as string | undefined } },
    );
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
    fakeServer({ initial: [projectPreset] });
    const { result } = renderHookWithQuery(() => usePresets("proj-1"));
    await waitFor(() => expect(result.current.user).toHaveLength(1));
    await act(async () => {
      await result.current.promote(userPreset.id);
    });
    await waitFor(() => expect(result.current.user).toEqual([promoted]));
  });
});
