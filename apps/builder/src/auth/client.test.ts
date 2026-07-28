import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "../presets/config";
import {
  changePassword,
  fetchMe,
  forgotPassword,
  login,
  logout,
  register,
  resetPassword,
  verifyEmail,
} from "./client";

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

  describe("password recovery (A2)", () => {
    it("forgotPassword POSTs the email and resolves on the generic ok", async () => {
      const fetchFn = mockFetch({ json: async () => ({ ok: true }) });
      await expect(forgotPassword("a@b.com")).resolves.toBeUndefined();
      expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ email: "a@b.com" }),
      });
    });

    it("resetPassword POSTs token + new password", async () => {
      const fetchFn = mockFetch({ json: async () => ({ ok: true }) });
      await resetPassword("tok", "password8");
      expect(fetchFn).toHaveBeenCalledWith(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ token: "tok", password: "password8" }),
      });
    });

    it("verifyEmail surfaces the server message on a spent link", async () => {
      mockFetch({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ message: "Invalid or expired token" }),
      });
      await expect(verifyEmail("tok")).rejects.toThrow("Invalid or expired token");
    });

    it("changePassword returns the re-issued profile", async () => {
      const user = {
        id: "u1",
        email: "a@b.com",
        displayName: null,
        emailVerifiedAt: null,
        createdAt: "2026-01-01",
      };
      const fetchFn = mockFetch({ json: async () => ({ user }) });
      await expect(changePassword("old", "password8")).resolves.toEqual(user);
      expect(fetchFn).toHaveBeenCalledWith(
        `${API_BASE}/auth/change-password`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ currentPassword: "old", newPassword: "password8" }),
        }),
      );
    });
  });
});
