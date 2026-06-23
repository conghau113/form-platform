import { CURRENT_FORM_VERSION } from "@org/form-schema";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHookWithQuery } from "../query/testing";
import { useFormDefinition } from "./useFormDefinition";

const ok = (json: unknown) => ({ ok: true, statusText: "OK", json: async () => json });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useFormDefinition", () => {
  it("stays idle (no fetch) when no form is bound", () => {
    const fetchFn = vi.fn();
    vi.stubGlobal("fetch", fetchFn);
    const { result } = renderHookWithQuery(() => useFormDefinition(undefined));
    expect(result.current.definition).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("loads + migrates the bound form", async () => {
    // An old v1 raw form: migrate() must lift it to the current contract.
    const raw = { formVersion: 1, id: "f1", title: "Contact", fields: [] };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(ok(raw))),
    );
    const { result } = renderHookWithQuery(() => useFormDefinition("f1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.definition).not.toBeNull();
    expect(result.current.definition?.id).toBe("f1");
    expect(result.current.definition?.formVersion).toBe(CURRENT_FORM_VERSION);
  });

  it("surfaces a load failure as an error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, statusText: "Not Found", json: async () => ({}) })),
    );
    const { result } = renderHookWithQuery(() => useFormDefinition("missing"));
    await waitFor(() => expect(result.current.error).toBe("Not Found"));
    expect(result.current.definition).toBeNull();
  });
});
