import type { Preset } from "@org/form-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ownerHeaders } from "../workspace/config";
import { deletePreset, listPresets, promotePreset, savePreset } from "./client";
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
  it("listPresets GETs /presets with the owner header and returns the array", async () => {
    const fetchFn = mockFetch({ json: async () => [preset] });
    const result = await listPresets();
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/presets`, { headers: ownerHeaders() });
    expect(result).toEqual([preset]);
  });

  it("listPresets passes ?projectId= when scoped to a project", async () => {
    const fetchFn = mockFetch({ json: async () => [] });
    await listPresets("proj-1");
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/presets?projectId=proj-1`, {
      headers: ownerHeaders(),
    });
  });

  it("savePreset POSTs the preset as JSON with the owner header", async () => {
    const fetchFn = mockFetch({ json: async () => preset });
    const result = await savePreset(preset);
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/presets`, {
      method: "POST",
      headers: { "content-type": "application/json", ...ownerHeaders() },
      body: JSON.stringify(preset),
    });
    expect(result).toEqual(preset);
  });

  it("promotePreset POSTs /presets/:id/promote", async () => {
    const fetchFn = mockFetch({ json: async () => preset });
    await promotePreset(preset.id);
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/presets/${preset.id}/promote`, {
      method: "POST",
      headers: ownerHeaders(),
    });
  });

  it("deletePreset DELETEs /presets/:id (id encoded)", async () => {
    const fetchFn = mockFetch({});
    await deletePreset(preset.id);
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/presets/${preset.id}`, {
      method: "DELETE",
      headers: ownerHeaders(),
    });
  });

  it("throws with the server message on a non-OK response", async () => {
    mockFetch({ ok: false, statusText: "Bad Request", json: async () => ({ message: "boom" }) });
    await expect(savePreset(preset)).rejects.toThrow("boom");
  });
});
