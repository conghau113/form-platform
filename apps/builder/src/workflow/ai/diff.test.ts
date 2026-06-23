import type { WorkflowDefinition } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { diffWorkflows } from "./diff";

function wf(
  nodes: { id: string; status: string }[],
  transitions: { id: string; from: string; to: string; action: string }[],
  start = nodes[0]?.id ?? "",
): WorkflowDefinition {
  return { workflowVersion: 1, id: "wf", title: "WF", start, nodes, transitions };
}

const current = wf(
  [
    { id: "a", status: "Draft" },
    { id: "b", status: "Submitted" },
  ],
  [{ id: "t1", from: "a", to: "b", action: "submit" }],
);

describe("diffWorkflows", () => {
  it("reports added / removed / kept state labels and counts", () => {
    const proposed = wf(
      [
        { id: "n1", status: "Draft" },
        { id: "n2", status: "Manager review" },
        { id: "n3", status: "Approved" },
      ],
      [
        { id: "x1", from: "n1", to: "n2", action: "submit" },
        { id: "x2", from: "n2", to: "n3", action: "approve" },
      ],
      "n1",
    );

    const d = diffWorkflows(current, proposed);
    expect(d.addedStates).toEqual(["Manager review", "Approved"]);
    expect(d.removedStates).toEqual(["Submitted"]);
    expect(d.keptStates).toEqual(["Draft"]);
    expect(d.currentStateCount).toBe(2);
    expect(d.proposedStateCount).toBe(3);
    expect(d.currentTransitionCount).toBe(1);
    expect(d.proposedTransitionCount).toBe(2);
    expect(d.proposedStart).toBe("Draft");
  });

  it("de-duplicates repeated labels but keeps true counts", () => {
    const proposed = wf(
      [
        { id: "p1", status: "Draft" },
        { id: "p2", status: "Draft" },
      ],
      [],
      "p1",
    );
    const d = diffWorkflows(current, proposed);
    expect(d.keptStates).toEqual(["Draft"]); // de-duplicated
    expect(d.proposedStateCount).toBe(2); // true total
  });

  it("resolves the proposed start label by node id", () => {
    const proposed = wf(
      [
        { id: "s1", status: "Intake" },
        { id: "s2", status: "Closed" },
      ],
      [{ id: "e1", from: "s1", to: "s2", action: "close" }],
      "s2",
    );
    expect(diffWorkflows(current, proposed).proposedStart).toBe("Closed");
  });
});
