import type { WorkflowDefinition } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { fromFlow, toFlow } from "./workflow-model";

const def: WorkflowDefinition = {
  workflowVersion: 1,
  id: "wf",
  title: "WF",
  start: "created",
  nodes: [
    { id: "created", status: "created", formId: "intake", position: { x: 0, y: 0 } },
    { id: "done", status: "done", position: { x: 260, y: 0 } },
  ],
  transitions: [
    {
      id: "t1",
      from: "created",
      to: "done",
      action: "approve",
      role: "manager",
      guard: { rule: { "==": [{ var: "ok" }, true] } },
    },
  ],
};

describe("workflow-model boundary", () => {
  it("round-trips a definition through xyflow and back", () => {
    const { meta, nodes, edges } = toFlow(def);
    const out = fromFlow(meta, nodes, edges);
    expect(out).toEqual(def);
  });

  it("marks the start node and binds form ids on the flow side", () => {
    const { nodes } = toFlow(def);
    const start = nodes.find((n) => n.id === "created");
    expect(start?.data.isStart).toBe(true);
    expect(start?.data.formId).toBe("intake");
    expect(nodes.find((n) => n.id === "done")?.data.isStart).toBe(false);
  });

  it("keeps xyflow-only fields out of the schema", () => {
    const { meta, nodes, edges } = toFlow(def);
    // Simulate xyflow decorating nodes/edges with runtime-only fields.
    const dirtyNodes = nodes.map((n) => ({
      ...n,
      selected: true,
      dragging: false,
      measured: { width: 10, height: 5 },
    }));
    const dirtyEdges = edges.map((e) => ({ ...e, selected: true }));
    const out = fromFlow(meta, dirtyNodes as typeof nodes, dirtyEdges as typeof edges);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("selected");
    expect(serialized).not.toContain("dragging");
    expect(serialized).not.toContain("measured");
    expect(out).toEqual(def);
  });
});
