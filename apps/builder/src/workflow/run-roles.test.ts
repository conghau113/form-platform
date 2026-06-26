import type { WorkflowDefinition } from "@org/workflow-schema";
import { describe, expect, it } from "vitest";
import { workflowRoles } from "./run-roles";

const def = (transitions: WorkflowDefinition["transitions"]): WorkflowDefinition => ({
  workflowVersion: 1,
  id: "wf",
  title: "WF",
  start: "draft",
  nodes: [
    { id: "draft", status: "Draft" },
    { id: "review", status: "Review" },
    { id: "done", status: "Done" },
  ],
  transitions,
});

const t = (id: string, from: string, to: string, action: string, role?: string) => ({
  id,
  from,
  to,
  action,
  role,
});

describe("workflowRoles", () => {
  it("returns the distinct roles gated on transitions, in definition order", () => {
    const d = def([
      t("t1", "draft", "review", "submit", "employee"),
      t("t2", "review", "done", "approve", "manager"),
    ]);
    expect(workflowRoles(d)).toEqual(["employee", "manager"]);
  });

  it("dedupes a role reused across transitions, preserving first appearance", () => {
    const d = def([
      t("t1", "draft", "review", "submit", "employee"),
      t("t2", "review", "done", "approve", "manager"),
      t("t3", "review", "draft", "reject", "manager"),
      t("t4", "done", "draft", "reopen", "employee"),
    ]);
    expect(workflowRoles(d)).toEqual(["employee", "manager"]);
  });

  it("ignores transitions without a role", () => {
    const d = def([
      t("t1", "draft", "review", "submit"),
      t("t2", "review", "done", "approve", "hr"),
    ]);
    expect(workflowRoles(d)).toEqual(["hr"]);
  });

  it("returns an empty list when no transition is role-gated", () => {
    const d = def([t("t1", "draft", "review", "submit"), t("t2", "review", "done", "approve")]);
    expect(workflowRoles(d)).toEqual([]);
  });
});
