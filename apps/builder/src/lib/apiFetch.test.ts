import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, setSessionExpiredHandler } from "./apiFetch";

/** A minimal Response stand-in — apiFetch reads `.status`; ensureRefresh reads `.ok`. */
const resp = (status: number) => ({ status, ok: status >= 200 && status < 300 }) as Response;

describe("apiFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    setSessionExpiredHandler(null);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a non-401 response without attempting a refresh", async () => {
    fetchMock.mockResolvedValueOnce(resp(200));
    const res = await apiFetch("/api/projects");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("on 401 refreshes then retries the original request", async () => {
    fetchMock
      .mockResolvedValueOnce(resp(401)) // original
      .mockResolvedValueOnce(resp(200)) // POST /auth/refresh
      .mockResolvedValueOnce(resp(200)); // retry
    const res = await apiFetch("/api/projects");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain("/auth/refresh");
  });

  it("surfaces the original 401 and notifies when the refresh fails", async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock
      .mockResolvedValueOnce(resp(401)) // original
      .mockResolvedValueOnce(resp(401)); // failed refresh
    const res = await apiFetch("/api/projects");
    expect(res.status).toBe(401);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // no retry
  });

  it("never refreshes for auth endpoints (login/refresh/logout)", async () => {
    fetchMock.mockResolvedValueOnce(resp(401));
    const res = await apiFetch("/api/auth/login", { method: "POST" });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent refreshes into a single /auth/refresh call", async () => {
    // Two calls 401, then a shared refresh, then each retries.
    const seen = new Set<string>();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/refresh")) return Promise.resolve(resp(200));
      // First hit per request 401s; the retry (after refresh) succeeds. Track per-url attempts.
      if (seen.has(url)) return Promise.resolve(resp(200));
      seen.add(url);
      return Promise.resolve(resp(401));
    });
    const [a, b] = await Promise.all([apiFetch("/api/a"), apiFetch("/api/b")]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const refreshCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh"));
    expect(refreshCalls).toHaveLength(1);
  });
});
