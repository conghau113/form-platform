import type { WorkflowDefinition } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { advance, availableTransitions, createInstance } from "./index.js";

// created --submit--> inprogress --approve(role:manager, guard:approved==true)--> done
const def: WorkflowDefinition = {
  workflowVersion: 1,
  id: "wf",
  title: "WF",
  start: "created",
  nodes: [
    { id: "created", status: "created" },
    { id: "inprogress", status: "inprogress" },
    { id: "done", status: "done" },
  ],
  transitions: [
    { id: "t1", from: "created", to: "inprogress", action: "submit" },
    {
      id: "t2",
      from: "inprogress",
      to: "done",
      action: "approve",
      role: "manager",
      guard: { rule: { "==": [{ var: "approved" }, true] } },
    },
  ],
};

describe("createInstance", () => {
  it("starts at the definition's start node and pins the version", () => {
    const inst = createInstance(def, { id: "case-1" });
    expect(inst.current).toBe("created");
    expect(inst.definitionId).toBe("wf");
    expect(inst.definitionVersion).toBe(1);
    expect(inst.history).toEqual([]);
  });
});

describe("availableTransitions", () => {
  it("lists transitions leaving a state", () => {
    expect(availableTransitions(def, "created").map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("advance", () => {
  it("walks created -> inprogress -> done when guard and role are satisfied", () => {
    const i0 = createInstance(def, { id: "case-1" });

    const r1 = advance(def, i0, "submit");
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.instance.current).toBe("inprogress");
    expect(r1.instance.history).toHaveLength(1);

    const r2 = advance(def, r1.instance, "approve", {
      roles: ["manager"],
      data: { approved: true },
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.instance.current).toBe("done");
    expect(r2.instance.history.map((h) => h.action)).toEqual(["submit", "approve"]);
    expect(r2.instance.data.approved).toBe(true);
  });

  it("blocks on a failing guard", () => {
    const inprogress = { ...createInstance(def), current: "inprogress" };
    const r = advance(def, inprogress, "approve", {
      roles: ["manager"],
      data: { approved: false },
    });
    expect(r).toEqual({ ok: false, reason: "guard-failed" });
  });

  it("blocks when the actor lacks the required role", () => {
    const inprogress = { ...createInstance(def), current: "inprogress" };
    const r = advance(def, inprogress, "approve", { roles: ["clerk"], data: { approved: true } });
    expect(r).toEqual({ ok: false, reason: "role-denied" });
  });

  it("reports no-transition for an unknown action", () => {
    const i0 = createInstance(def);
    expect(advance(def, i0, "nope")).toEqual({ ok: false, reason: "no-transition" });
  });

  it("reports unknown-state when current does not exist", () => {
    const broken = { ...createInstance(def), current: "ghost" };
    expect(advance(def, broken, "submit")).toEqual({ ok: false, reason: "unknown-state" });
  });

  it("does not mutate the input instance", () => {
    const i0 = createInstance(def, { id: "case-1" });
    advance(def, i0, "submit");
    expect(i0.current).toBe("created");
    expect(i0.history).toHaveLength(0);
  });
});
