import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "../presets/config";
import { fetchMe, login, logout, register } from "./client";

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({}),
    ...response,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonHeaders = { "content-type": "application/json" };

describe("auth client", () => {
  it("login POSTs credentials and unwraps the user", async () => {
    const user = { id: "u1", email: "a@b.com", displayName: null, createdAt: "2026-01-01" };
    const fetchFn = mockFetch({ json: async () => ({ user }) });
    await expect(login("a@b.com", "secret")).resolves.toEqual(user);
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ email: "a@b.com", password: "secret" }),
    });
  });

  it("register POSTs email/password/displayName", async () => {
    const fetchFn = mockFetch({ json: async () => ({ user: { id: "u2" } }) });
    await register("new@b.com", "password8", "New User");
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ email: "new@b.com", password: "password8", displayName: "New User" }),
    });
  });

  it("fetchMe returns null on 401 (anonymous) rather than throwing", async () => {
    mockFetch({ ok: false, status: 401, json: async () => ({}) });
    await expect(fetchMe()).resolves.toBeNull();
  });

  it("fetchMe returns the profile when authenticated", async () => {
    const user = { id: "u1", email: "a@b.com", displayName: "A", createdAt: "2026-01-01" };
    mockFetch({ json: async () => user });
    await expect(fetchMe()).resolves.toEqual(user);
  });

  it("login throws with the server message on failure", async () => {
    mockFetch({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ message: "Invalid credentials" }),
    });
    await expect(login("a@b.com", "wrong")).rejects.toThrow("Invalid credentials");
  });

  it("logout POSTs to /auth/logout", async () => {
    const fetchFn = mockFetch({ json: async () => ({ ok: true }) });
    await logout();
    expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/auth/logout`, { method: "POST" });
  });
});
