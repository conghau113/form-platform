import type { WorkflowDefinition } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { validateGraph } from "./index.js";

const base: WorkflowDefinition = {
  workflowVersion: 1,
  id: "wf",
  title: "WF",
  start: "a",
  nodes: [
    { id: "a", status: "a" },
    { id: "b", status: "b" },
  ],
  transitions: [{ id: "t1", from: "a", to: "b", action: "next" }],
};

describe("validateGraph", () => {
  it("returns no errors for a sound graph", () => {
    expect(validateGraph(base)).toEqual([]);
  });

  it("flags a node unreachable from start", () => {
    const def = {
      ...base,
      nodes: [...base.nodes, { id: "orphan", status: "orphan" }],
    };
    const errors = validateGraph(def);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "unreachable", ref: "orphan" });
  });

  it("flags a transition referencing a missing node", () => {
    const def = {
      ...base,
      transitions: [...base.transitions, { id: "t2", from: "b", to: "ghost", action: "x" }],
    };
    expect(validateGraph(def).some((e) => e.code === "dangling-transition")).toBe(true);
  });

  it("flags a missing start node", () => {
    const def = { ...base, start: "nope" };
    expect(validateGraph(def).some((e) => e.code === "start-missing")).toBe(true);
  });

  it("flags duplicate node ids", () => {
    const def = { ...base, nodes: [base.nodes[0], base.nodes[0], base.nodes[1]] };
    expect(validateGraph(def).some((e) => e.code === "duplicate-node")).toBe(true);
  });
});
