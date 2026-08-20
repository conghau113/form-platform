import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE } from "../workspace/config";
import { advanceInstance, CaseConflictError } from "./client";

/**
 * `advanceInstance` only (E3c, parallel track): the branch a caller names has to reach the wire, and
 * a 409 has to arrive at the caller as something it can tell apart from an engine refusal.
 */
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

const bodyOf = (fetchFn: ReturnType<typeof mockFetch>): Record<string, unknown> =>
  JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("advanceInstance (E3c, parallel track)", () => {
  it("puts the named branch in the request body", async () => {
    const fetchFn = mockFetch({ json: async () => ({ id: "c1" }) });

    await advanceInstance("c1", { action: "approve", token: "t2" });

    expect(fetchFn.mock.calls[0][0]).toBe(`${API_BASE}/workflow-instances/c1/advance`);
    expect(bodyOf(fetchFn)).toEqual({ action: "approve", token: "t2" });
  });

  it("sends no token key at all when none was named", async () => {
    // The other half of the pair. Every case running today is single-branch and sends exactly these
    // two keys; a client that started naming a token for them would be exposed to `unknown-token`
    // for nothing (the engine matches against the marking AFTER gateways settle).
    const fetchFn = mockFetch({ json: async () => ({ id: "c1" }) });

    await advanceInstance("c1", { action: "submit" });

    expect(bodyOf(fetchFn)).toEqual({ action: "submit" });
    expect("token" in bodyOf(fetchFn)).toBe(false);
  });

  it("raises a CaseConflictError on 409, carrying the server's message", async () => {
    mockFetch({
      ok: false,
      status: 409,
      json: async () => ({ message: "Workflow instance changed while this action was processed" }),
    });

    await expect(advanceInstance("c1", { action: "approve" })).rejects.toBeInstanceOf(
      CaseConflictError,
    );
    await expect(advanceInstance("c1", { action: "approve" })).rejects.toThrow(
      /changed while this action/,
    );
  });

  it("raises a PLAIN Error on an engine refusal, so the two are not treated alike", async () => {
    // A 422 is the engine saying "not from here, not by you, not like that" — the user can act on
    // it. A 409 means the case moved and the view is stale. Collapsing them into one type would
    // make the reload-on-conflict behaviour fire on ordinary guard denials too.
    mockFetch({
      ok: false,
      status: 422,
      json: async () => ({ message: "Cannot advance instance: ambiguous-token" }),
    });

    const failure = await advanceInstance("c1", { action: "approve" }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(CaseConflictError);
  });
});
