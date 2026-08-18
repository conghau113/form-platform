import type { HistoryEntry, WorkflowDefinition, WorkflowInstance } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { nodeProgress } from "./index.js";

// draft --submit--> review --approve--> done, plus review --reject--> draft (a LOOP: the case can
// come back to a node it already left, which is the only way the "`at` is the departure" rule bites).
const def: WorkflowDefinition = {
  workflowVersion: 1,
  id: "wf",
  title: "WF",
  start: "draft",
  nodes: [
    { id: "draft", status: "Nháp" },
    { id: "review", status: "Đang duyệt" },
    { id: "done", status: "Xong" },
  ],
  transitions: [
    { id: "t1", from: "draft", to: "review", action: "submit" },
    { id: "t2", from: "review", to: "done", action: "approve" },
    { id: "t3", from: "review", to: "draft", action: "reject" },
  ],
};

/** An instance with a HAND-WRITTEN history. Deliberately not built by calling `advance()` twice:
 *  the engine stamps `at: new Date().toISOString()`, so two departures from the same node can land
 *  in the same millisecond — and then "first entry" and "last entry" are indistinguishable, which
 *  would leave the loop test permanently green no matter what the implementation picked. */
const instanceAt = (current: string, history: HistoryEntry[]): WorkflowInstance => ({
  id: "case-1",
  definitionId: "wf",
  definitionVersion: 1,
  current,
  data: {},
  history,
});

describe("nodeProgress", () => {
  it("reports every node as pending except the start a fresh case sits on", () => {
    expect(nodeProgress(def, instanceAt("draft", []))).toEqual({
      draft: { status: "active" },
      review: { status: "pending" },
      done: { status: "pending" },
    });
  });

  it("marks a left node done with the action and time it was left", () => {
    const progress = nodeProgress(
      def,
      instanceAt("review", [
        { from: "draft", to: "review", action: "submit", at: "2026-08-17T09:00:00.000Z" },
      ]),
    );
    expect(progress).toEqual({
      draft: { status: "done", at: "2026-08-17T09:00:00.000Z", action: "submit" },
      review: { status: "active" },
      done: { status: "pending" },
    });
  });

  it("reports the LAST departure when a node was left more than once", () => {
    // draft -submit-> review -reject-> draft -resubmit-> review. `draft` was left TWICE; both the
    // time AND the action differ, so picking the first entry cannot accidentally match.
    const progress = nodeProgress(
      def,
      instanceAt("review", [
        { from: "draft", to: "review", action: "submit", at: "2026-08-17T09:00:00.000Z" },
        { from: "review", to: "draft", action: "reject", at: "2026-08-17T10:00:00.000Z" },
        { from: "draft", to: "review", action: "resubmit", at: "2026-08-17T11:00:00.000Z" },
      ]),
    );
    expect(progress.draft).toEqual({
      status: "done",
      at: "2026-08-17T11:00:00.000Z",
      action: "resubmit",
    });
  });

  it("carries `actor` when the history has one and omits the key entirely when it does not", () => {
    const withActor = nodeProgress(
      def,
      instanceAt("review", [
        {
          from: "draft",
          to: "review",
          action: "submit",
          at: "2026-08-17T09:00:00.000Z",
          actor: "u1",
        },
      ]),
    );
    expect(withActor.draft).toEqual({
      status: "done",
      at: "2026-08-17T09:00:00.000Z",
      action: "submit",
      actor: "u1",
    });

    // Entries written before `actor` existed must not grow an invented one. `toEqual` on the whole
    // object is the assertion: it fails if an `actor` key appears at all.
    const without = nodeProgress(
      def,
      instanceAt("review", [
        { from: "draft", to: "review", action: "submit", at: "2026-08-17T09:00:00.000Z" },
      ]),
    );
    expect(without.draft).toEqual({
      status: "done",
      at: "2026-08-17T09:00:00.000Z",
      action: "submit",
    });
  });

  it("reports a node the case came BACK to as plainly active, with no stale departure meta", () => {
    // The case left `draft` at 09:00 and is standing on it again. Reporting that timestamp here
    // would read as "finished at 09:00" about work in progress.
    const progress = nodeProgress(
      def,
      instanceAt("draft", [
        { from: "draft", to: "review", action: "submit", at: "2026-08-17T09:00:00.000Z" },
        { from: "review", to: "draft", action: "reject", at: "2026-08-17T10:00:00.000Z" },
      ]),
    );
    expect(progress.draft).toEqual({ status: "active" });
    expect(progress.review).toEqual({
      status: "done",
      at: "2026-08-17T10:00:00.000Z",
      action: "reject",
    });
  });

  it("leaves nothing active when `current` names no node in the definition", () => {
    const progress = nodeProgress(def, instanceAt("archived", []));
    expect(Object.values(progress).some((p) => p.status === "active")).toBe(false);
    expect(progress).toEqual({
      draft: { status: "pending" },
      review: { status: "pending" },
      done: { status: "pending" },
    });
  });

  it("ignores history about nodes the definition no longer has", () => {
    const progress = nodeProgress(
      def,
      instanceAt("draft", [
        { from: "removed", to: "draft", action: "restore", at: "2026-08-17T09:00:00.000Z" },
      ]),
    );
    expect(Object.keys(progress)).toEqual(["draft", "review", "done"]);
  });

  it("is pure: every reported time comes verbatim from the history, and inputs are untouched", () => {
    const instance = instanceAt("review", [
      { from: "draft", to: "review", action: "submit", at: "2026-08-17T09:00:00.000Z" },
    ]);
    const defBefore = structuredClone(def);
    const instanceBefore = structuredClone(instance);

    const progress = nodeProgress(def, instance);

    // A clock reaching into the function would surface here as a timestamp no history entry holds.
    // (Comparing two calls would NOT: both would agree inside the same millisecond.)
    //
    // Count first: without this, an implementation that reported no `at` at all would satisfy the
    // loop below vacuously while the test name still claims every reported time was checked.
    const done = Object.values(progress).filter((e) => e.status === "done");
    expect(done).toHaveLength(1);
    const historyTimes = new Set(instance.history.map((h) => h.at));
    for (const entry of done) {
      expect(historyTimes.has(entry.at)).toBe(true);
    }
    expect(def).toEqual(defBefore);
    expect(instance).toEqual(instanceBefore);
  });
});

describe("nodeProgress — a case standing in several places (E3a)", () => {
  it("marks EVERY node a token is parked on as active, not just the representative", () => {
    // A forked case stands on `draft` and `review` at once. `current` can only name one of them, so
    // reading it would report the other branch as untouched — the branch someone is working in.
    const forked: WorkflowInstance = {
      id: "case-2",
      definitionId: "wf",
      definitionVersion: 1,
      current: "draft",
      data: {},
      history: [],
      tokens: [
        { id: "s-1-0", at: "draft", scope: "s-1" },
        { id: "s-1-1", at: "review", scope: "s-1" },
      ],
      scopes: { "s-1": { forkNode: "draft", expected: 2, parent: null } },
    };
    expect(nodeProgress(def, forked)).toEqual({
      draft: { status: "active" },
      review: { status: "active" },
      done: { status: "pending" },
    });
  });

  it("prefers a token's position over a `current` that disagrees with it", () => {
    // Once a marking exists, `current` is only the representative. A reader that still believed it
    // would place the case on a node no token occupies.
    const skewed: WorkflowInstance = {
      id: "case-3",
      definitionId: "wf",
      definitionVersion: 1,
      current: "draft",
      data: {},
      history: [],
      tokens: [{ id: "t", at: "review", scope: "root" }],
    };
    const out = nodeProgress(def, skewed);
    expect(out.review).toEqual({ status: "active" });
    expect(out.draft).toEqual({ status: "pending" });
  });
});
