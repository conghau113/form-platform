import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveTenantId, setActiveTenantId } from "./activeTenant";

describe("activeTenant", () => {
  afterEach(() => {
    setActiveTenantId(null);
  });

  it("starts with no selection", () => {
    expect(getActiveTenantId()).toBeNull();
  });

  it("stores the selection and persists it to localStorage", () => {
    setActiveTenantId("tnt_team");
    expect(getActiveTenantId()).toBe("tnt_team");
    expect(window.localStorage.getItem("activeTenantId")).toBe("tnt_team");
  });

  it("clears the selection on null (back to the server default)", () => {
    setActiveTenantId("tnt_team");
    setActiveTenantId(null);
    expect(getActiveTenantId()).toBeNull();
    expect(window.localStorage.getItem("activeTenantId")).toBeNull();
  });

  it("ignores a tampered stored value instead of letting it break requests", () => {
    // A CR/LF would make `Headers.set` throw in apiFetch — degrade to "no preference".
    setActiveTenantId(null);
    window.localStorage.setItem("activeTenantId", "tnt\r\nX-Injected: 1");
    // Force a re-read of storage (the module caches the last known value).
    vi.resetModules();
    return import("./activeTenant").then((m) => {
      expect(m.getActiveTenantId()).toBeNull();
    });
  });
});
