import type { WorkflowDefinition } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { lintGraph, validateGraph } from "./index.js";

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

describe("lintGraph", () => {
  it("returns no warnings for a sound graph", () => {
    expect(lintGraph(base)).toEqual([]);
  });

  it("does not nag a single-node draft", () => {
    const def: WorkflowDefinition = {
      ...base,
      start: "draft",
      nodes: [{ id: "draft", status: "draft" }],
      transitions: [],
    };
    expect(lintGraph(def)).toEqual([]);
  });

  it("flags the start node when it has no outgoing transition (multi-node)", () => {
    const def = { ...base, transitions: [] };
    const warnings = lintGraph(def);
    expect(warnings.some((w) => w.code === "dead-end" && w.ref === "a")).toBe(true);
  });

  it("flags a kind:normal node that goes nowhere", () => {
    const def: WorkflowDefinition = {
      ...base,
      nodes: [base.nodes[0], { id: "b", status: "b", kind: "normal" }],
    };
    expect(lintGraph(def).some((w) => w.code === "dead-end" && w.ref === "b")).toBe(true);
  });

  it("does not flag a kind:end node with no outgoing", () => {
    const def: WorkflowDefinition = {
      ...base,
      nodes: [base.nodes[0], { id: "b", status: "b", kind: "end" }],
    };
    expect(lintGraph(def)).toEqual([]);
  });

  it("does not flag a legacy (kind-less) terminal node", () => {
    // base.b has no kind and no outgoing — left alone so old definitions don't get nagged.
    expect(lintGraph(base)).toEqual([]);
  });

  it("flags a kind:end node that still has an outgoing transition", () => {
    const def: WorkflowDefinition = {
      ...base,
      nodes: [base.nodes[0], { id: "b", status: "b", kind: "end" }],
      transitions: [
        { id: "t1", from: "a", to: "b", action: "next" },
        { id: "t2", from: "b", to: "a", action: "back" },
      ],
    };
    expect(lintGraph(def).some((w) => w.code === "end-has-outgoing" && w.ref === "b")).toBe(true);
  });
});
