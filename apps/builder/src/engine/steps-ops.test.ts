import type { FieldNode } from "@org/form-schema";
import { describe, expect, it } from "vitest";
import { metaGuard, newField } from "../field-registry";
import { applyStepsOp } from "./steps-ops";
import { fieldToTree } from "./transform";
import { findNode, type TreeNode } from "./tree";

/** A steps node (in a tiny tree) seeded from the registry defaults (two step panes). */
function stepsTree(): { root: TreeNode; stepsUid: string } {
  const steps = fieldToTree(newField("steps"));
  const root: TreeNode = {
    uid: "root",
    node: { type: "form", id: "f", title: "F" },
    children: [steps],
  };
  return { root, stepsUid: steps.uid };
}

const guard = metaGuard();
const stepLabels = (root: TreeNode, stepsUid: string) =>
  (findNode(root, stepsUid)?.children ?? []).map((c) => (c.node as { label?: string }).label);

describe("applyStepsOp", () => {
  it("adds a step pane built from the registry seed", () => {
    const { root, stepsUid } = stepsTree();
    const step = newField("step") as FieldNode;
    const next = applyStepsOp(root, stepsUid, { kind: "add", step }, guard);
    expect(findNode(next, stepsUid)?.children).toHaveLength(3);
  });

  it("removes the step at an index", () => {
    const { root, stepsUid } = stepsTree();
    const next = applyStepsOp(root, stepsUid, { kind: "remove", index: 0 }, guard);
    expect(stepLabels(next, stepsUid)).toEqual(["Step 2"]);
  });

  it("patches a step's label and description", () => {
    const { root, stepsUid } = stepsTree();
    const next = applyStepsOp(
      root,
      stepsUid,
      { kind: "patch", index: 1, patch: { label: "Profile", description: "About you" } },
      guard,
    );
    const second = findNode(next, stepsUid)?.children[1]?.node as {
      label?: string;
      description?: string;
    };
    expect(second).toMatchObject({ label: "Profile", description: "About you" });
  });

  it("moves a step toward the end", () => {
    const { root, stepsUid } = stepsTree();
    const next = applyStepsOp(root, stepsUid, { kind: "move", index: 0, dir: 1 }, guard);
    expect(stepLabels(next, stepsUid)).toEqual(["Step 2", "Step 1"]);
  });

  it("preserves a moved step's uid (no descendant regeneration)", () => {
    const { root, stepsUid } = stepsTree();
    const firstUid = findNode(root, stepsUid)?.children[0]?.uid;
    const next = applyStepsOp(root, stepsUid, { kind: "move", index: 0, dir: 1 }, guard);
    expect(findNode(next, stepsUid)?.children[1]?.uid).toBe(firstUid);
  });

  it("is a no-op (same reference) for an unknown uid or out-of-range index", () => {
    const { root, stepsUid } = stepsTree();
    expect(applyStepsOp(root, "missing", { kind: "remove", index: 0 }, guard)).toBe(root);
    expect(applyStepsOp(root, stepsUid, { kind: "remove", index: 9 }, guard)).toBe(root);
    expect(applyStepsOp(root, stepsUid, { kind: "move", index: 1, dir: 1 }, guard)).toBe(root);
  });
});
