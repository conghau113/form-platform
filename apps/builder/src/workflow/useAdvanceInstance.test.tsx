import { useQueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { qk } from "../query";
import { renderHookWithQuery } from "../query/testing";
import { CaseConflictError } from "./client";
import { useAdvanceInstance } from "./useWorkflowInstances";

/**
 * The 409 half of `useAdvanceInstance` (E3c, parallel track). The client module is mocked EXCEPT for
 * `CaseConflictError` itself — the hook recognises the conflict by type, so a stand-in class would
 * make this test agree with an implementation that no longer matches production's.
 */
vi.mock("./client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client")>()),
  advanceInstance: vi.fn(),
}));

const { advanceInstance } = await import("./client");
const advanceMock = vi.mocked(advanceInstance);

/** The hook plus the very client it will invalidate, so the assertions watch the real thing. */
function mountAdvance() {
  const { result } = renderHookWithQuery(() => ({
    qc: useQueryClient(),
    advance: useAdvanceInstance("c1", "wf1"),
  }));
  return { result, invalidate: vi.spyOn(result.current.qc, "invalidateQueries") };
}

beforeEach(() => {
  advanceMock.mockReset();
});

describe("useAdvanceInstance — a case that moved under us (E3c, parallel track)", () => {
  it("refetches the case AND the workflow's list when the server reports a conflict", async () => {
    advanceMock.mockRejectedValue(new CaseConflictError("Workflow instance changed"));
    const { result, invalidate } = mountAdvance();

    await expect(result.current.advance({ action: "approve" })).rejects.toBeInstanceOf(
      CaseConflictError,
    );

    // Both, not just the case: the list's denormalised `current` is stale for the same reason.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.instance("c1") });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.instances("wf1") });
  });

  it("leaves the cache alone when the engine merely REFUSED the action", async () => {
    // A 422 (`guard-failed`, `ambiguous-token`, …) is not a stale view — the case is exactly where
    // the user thinks it is. Refetching there would repaint the screen after every denied click and
    // teach people that a refusal means "something changed".
    advanceMock.mockRejectedValue(new Error("Cannot advance instance: guard-failed"));
    const { result, invalidate } = mountAdvance();

    await expect(result.current.advance({ action: "approve" })).rejects.toThrow(/guard-failed/);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("passes the named branch through to the client untouched", async () => {
    advanceMock.mockResolvedValue({
      id: "c1",
      definitionId: "wf1",
      definitionVersion: 1,
      current: "J",
      data: {},
      history: [],
    });
    const { result } = mountAdvance();

    await result.current.advance({ action: "approve", token: "t2" });

    expect(advanceMock).toHaveBeenCalledWith("c1", { action: "approve", token: "t2" });
  });
});
