import { validateGraph } from "@org/workflow-core";
import { CURRENT_WORKFLOW_VERSION } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { duplicateWorkflow, newWorkflow } from "./newWorkflow";

describe("newWorkflow", () => {
  it("produces a current-version, graph-valid workflow with a start state", () => {
    const wf = newWorkflow("Approval flow");
    expect(wf.workflowVersion).toBe(CURRENT_WORKFLOW_VERSION);
    expect(wf.start).toBe("draft");
    expect(wf.nodes.map((n) => n.id)).toContain(wf.start);
    expect(validateGraph(wf)).toEqual([]);
  });

  it("slugifies the title into the id and falls back when empty", () => {
    expect(newWorkflow("Approval flow").id).toMatch(/^approval-flow-[0-9a-f]{8}$/);
    expect(newWorkflow("   ").id).toMatch(/^workflow-[0-9a-f]{8}$/);
    expect(newWorkflow("   ").title).toBe("Untitled workflow");
  });
});

describe("duplicateWorkflow", () => {
  it("gives the copy a fresh id and a ' (copy)' title, keeping the graph", () => {
    const src = newWorkflow("Original");
    const copy = duplicateWorkflow(src);
    expect(copy.id).not.toBe(src.id);
    expect(copy.title).toBe("Original (copy)");
    expect(copy.nodes).toEqual(src.nodes);
    expect(validateGraph(copy)).toEqual([]);
  });
});
