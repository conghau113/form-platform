import {
  CURRENT_WORKFLOW_VERSION,
  type Guard,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowTransition,
} from "@org/workflow-schema";
import type { Edge, Node } from "@xyflow/react";

/**
 * The ONLY xyflow <-> workflow-schema boundary (analogous to model.ts's
 * toFormSchema / fromFormSchema). xyflow runtime fields (selected, dragging,
 * measured, ...) live only on these editor objects and NEVER enter the contract;
 * conversion reads back just id / position / data.
 */

/** Editor-only data carried on an xyflow node (the schema reads it back at the boundary). */
export interface FlowNodeData {
  status: string;
  formId?: string;
  /** True for the definition's start node — drives the "start" badge. */
  isStart: boolean;
  [key: string]: unknown;
}

/** Editor-only data carried on an xyflow edge. */
export interface FlowEdgeData {
  action: string;
  role?: string;
  guard?: Guard;
  [key: string]: unknown;
}

export type FlowNode = Node<FlowNodeData, "workflow">;
export type FlowEdge = Edge<FlowEdgeData>;

/** Definition-level metadata held alongside the xyflow nodes/edges in the editor. */
export interface WorkflowMeta {
  id: string;
  title: string;
  start: string;
}

/** Definition -> xyflow graph. Falls back to a left-to-right layout when a node
 *  has no stored position. */
export function toFlow(def: WorkflowDefinition): {
  meta: WorkflowMeta;
  nodes: FlowNode[];
  edges: FlowEdge[];
} {
  const nodes: FlowNode[] = def.nodes.map((n, i) => ({
    id: n.id,
    type: "workflow",
    position: n.position ?? { x: i * 260, y: 0 },
    data: { status: n.status, formId: n.formId, isStart: n.id === def.start },
  }));
  const edges: FlowEdge[] = def.transitions.map((t) => ({
    id: t.id,
    source: t.from,
    target: t.to,
    label: t.action,
    data: { action: t.action, role: t.role, guard: t.guard },
  }));
  return { meta: { id: def.id, title: def.title, start: def.start }, nodes, edges };
}

/** xyflow graph -> versioned definition. Reads back only id/position/data. */
export function fromFlow(
  meta: WorkflowMeta,
  nodes: FlowNode[],
  edges: FlowEdge[],
): WorkflowDefinition {
  const wfNodes: WorkflowNode[] = nodes.map((n) => ({
    id: n.id,
    status: n.data.status,
    ...(n.data.formId ? { formId: n.data.formId } : {}),
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
  }));
  const transitions: WorkflowTransition[] = edges.map((e) => ({
    id: e.id,
    from: e.source,
    to: e.target,
    action: e.data?.action ?? "next",
    ...(e.data?.role ? { role: e.data.role } : {}),
    ...(e.data?.guard ? { guard: e.data.guard } : {}),
  }));
  return {
    workflowVersion: CURRENT_WORKFLOW_VERSION,
    id: meta.id,
    title: meta.title,
    start: meta.start,
    nodes: wfNodes,
    transitions,
  };
}

let counter = 0;
/** Collision-free editor id (not the same space as form-model uids). */
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}

/** A fresh state node placed at `position`. */
export function newNode(status: string, position: { x: number; y: number }): FlowNode {
  const id = nextId("n");
  return { id, type: "workflow", position, data: { status, isStart: false } };
}

/** A fresh transition between two nodes. */
export function newEdge(source: string, target: string, action: string): FlowEdge {
  return {
    id: nextId("t"),
    source,
    target,
    label: action,
    data: { action },
  };
}
