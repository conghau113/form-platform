import { describe, expect, it } from "vitest";
import { CURRENT_WORKFLOW_VERSION, workflowDefinitionSchema } from "./index.js";

const validDef = {
  workflowVersion: CURRENT_WORKFLOW_VERSION,
  id: "wf",
  title: "WF",
  start: "a",
  nodes: [
    { id: "a", status: "created", formId: "f1" },
    { id: "b", status: "done" },
  ],
  transitions: [{ id: "t1", from: "a", to: "b", action: "next" }],
};

describe("workflowDefinitionSchema", () => {
  it("parses a valid definition", () => {
    const out = workflowDefinitionSchema.parse(validDef);
    expect(out.start).toBe("a");
    expect(out.nodes).toHaveLength(2);
  });

  it("rejects a node with an empty id", () => {
    const bad = { ...validDef, nodes: [{ id: "", status: "x" }] };
    expect(() => workflowDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects a transition missing its action", () => {
    const bad = { ...validDef, transitions: [{ id: "t1", from: "a", to: "b" }] };
    expect(() => workflowDefinitionSchema.parse(bad)).toThrow();
  });
});
