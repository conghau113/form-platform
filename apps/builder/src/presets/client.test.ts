import type { Preset } from "@org/form-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deletePreset, listPresets, savePreset } from "./client";
import { API_BASE } from "./config";

const preset: Preset = {
  id: "builtin-search",
  fieldType: "text",
  name: "Search input",
  patch: { placeholder: "Search" },
};

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi
    .fn()
    .mockResolvedValue({ ok: true, statusText: "OK", json: async () => ({}), ...response });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preset client", () => {
  it("listPresets GETs /presets and returns the array", async () => {
    const fetchFn = mockFetch({ json: async () => [preset] });
    const result = await listPresets();
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/presets`);
    expect(result).toEqual([preset]);
  });

  it("savePreset POSTs the preset as JSON", async () => {
    const fetchFn = mockFetch({ json: async () => preset });
    const result = await savePreset(preset);
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/presets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(preset),
    });
    expect(result).toEqual(preset);
  });

  it("deletePreset DELETEs /presets/:id (id encoded)", async () => {
    const fetchFn = mockFetch({});
    await deletePreset(preset.id);
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/presets/${preset.id}`, { method: "DELETE" });
  });

  it("throws with the server message on a non-OK response", async () => {
    mockFetch({ ok: false, statusText: "Bad Request", json: async () => ({ message: "boom" }) });
    await expect(savePreset(preset)).rejects.toThrow("boom");
  });
});
