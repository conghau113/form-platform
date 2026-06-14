import type { FieldNode } from "@org/form-schema";
import { fieldToTree } from "./transform";
import {
  append,
  type EngineProps,
  findNode,
  type InsertGuard,
  move,
  patchNode,
  remove,
  type TreeNode,
} from "./tree";

/* ----------------------------------------------------------------------------
 * Steps write-path.
 *
 * A `steps` node is a layout container, so the PropertyPanel's normal edit route
 * (`applyFieldEdit` → `patchNode`) deliberately drops its `children` to keep selectable
 * descendant uids stable. The StepsEditor therefore mutates the step list through these
 * dedicated tree ops instead, resolving each child `step`'s uid by its index. Every op is
 * pure and returns the SAME root reference on a no-op (missing node / out-of-range index),
 * matching the rest of the engine.
 * ------------------------------------------------------------------------- */

export type StepsOp =
  | { kind: "add"; step: FieldNode }
  | { kind: "remove"; index: number }
  | { kind: "move"; index: number; dir: -1 | 1 }
  | { kind: "patch"; index: number; patch: { label?: string; description?: string } };

export function applyStepsOp(
  root: TreeNode,
  stepsUid: string,
  op: StepsOp,
  guard?: InsertGuard,
): TreeNode {
  const steps = findNode(root, stepsUid);
  if (!steps) return root;

  if (op.kind === "add") {
    return append(root, stepsUid, fieldToTree(op.step), guard);
  }

  const child = steps.children[op.index];
  if (!child) return root;

  if (op.kind === "remove") return remove(root, child.uid);
  if (op.kind === "patch") return patchNode(root, child.uid, op.patch as Partial<EngineProps>);

  // move: swap with the adjacent sibling in the requested direction.
  const sibling = steps.children[op.index + op.dir];
  if (!sibling) return root;
  return move(root, child.uid, { kind: op.dir < 0 ? "before" : "after", uid: sibling.uid }, guard);
}
