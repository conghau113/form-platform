import {
  CURRENT_WORKFLOW_VERSION,
  type Guard,
  type I18nMap,
  type StatusKind,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowTransition,
} from "@org/workflow-schema";
import { type Edge, MarkerType, type Node } from "@xyflow/react";

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
  /** WE4 status catalog: a referenced catalog entry's code, and a frozen `kind` snapshot for the
   *  node's colour (resolved against the project catalog; both round-trip to the contract). */
  statusCode?: string;
  kind?: StatusKind;
  /** WF4b: localized overrides of this node's `status` label. Carried through unchanged (no editor
   *  authoring UI yet) so an AI/JSON-authored map survives a Save round-trip. */
  i18n?: I18nMap;
  /** E1: who this state is expected to land on. Carried through for exactly the same reason as
   *  `i18n` above — the authoring UI lands later, and until it does, opening a workflow that has
   *  one and pressing Save would otherwise DELETE it silently. A suggestion, never a permission. */
  defaultAssignee?: WorkflowNode["defaultAssignee"];
  /** E2: the parallel-flow marker. Carried through for the same reason as the two above — the
   *  editor has no gateway authoring UI until E6, and until it does, opening a workflow that has one
   *  and pressing Save would otherwise DELETE it silently. */
  gateway?: WorkflowNode["gateway"];
  [key: string]: unknown;
}

/** Editor-only data carried on an xyflow edge. */
export interface FlowEdgeData {
  action: string;
  role?: string;
  guard?: Guard;
  /** WF4b: localized overrides of this transition's action LABEL. Carried through unchanged. */
  i18n?: I18nMap;
  [key: string]: unknown;
}

export type FlowNode = Node<FlowNodeData, "workflow">;
export type FlowEdge = Edge<FlowEdgeData>;

/** Presentation shared by every transition edge: float to the nearest border + an arrowhead.
 *  Editor-only — `fromFlow` never reads it, so it stays out of the workflow contract.
 *
 *  `zIndex` lifts the transition ABOVE the state cards. xyflow paints
 *  `div.react-flow__edges` before `div.react-flow__nodes` and gives both z-index 0, so at the
 *  default an edge passing behind a card simply disappears — the reviewer's "mất dây". Each edge is
 *  its own `<svg style={{zIndex}}>`, so a single step is enough to win against an unselected node
 *  (`internals.z === 0`); a SELECTED node is elevated well past this and still covers its edges,
 *  which is what we want. The edge LABEL lives in a separate layer and needs the CSS rule in
 *  `workflow-canvas.css` — raising only this one would leave every label still buried. */
const EDGE_PRESENTATION = {
  type: "floating",
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  zIndex: 1,
} as const;

/** Definition-level metadata held alongside the xyflow nodes/edges in the editor. */
export interface WorkflowMeta {
  id: string;
  title: string;
  start: string;
  /** WF4b: definition-level localization, carried through unchanged so a Save round-trips it. */
  i18n?: I18nMap;
  defaultLocale?: string;
  locales?: string[];
}

/** A committed editor state for undo/redo (the value carried by the History<T> primitive). */
export interface WorkflowSnapshot {
  meta: WorkflowMeta;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** Normalize the live editor state into an undo snapshot, dropping xyflow's volatile runtime
 *  fields (selected/dragging/measured) so a restored snapshot never re-applies stale interaction
 *  state. Keeps each edge's presentation (type/markerEnd/label) so restored edges still float. */
export function snapshot(
  meta: WorkflowMeta,
  nodes: FlowNode[],
  edges: FlowEdge[],
): WorkflowSnapshot {
  return {
    meta: { ...meta },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { ...n.position },
      data: { ...n.data },
    })),
    edges: edges.map((e) => ({ ...e, selected: false })),
  };
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
    data: {
      status: n.status,
      formId: n.formId,
      isStart: n.id === def.start,
      statusCode: n.statusCode,
      kind: n.kind,
      i18n: n.i18n,
      defaultAssignee: n.defaultAssignee,
      gateway: n.gateway,
    },
  }));
  const edges: FlowEdge[] = def.transitions.map((t) => ({
    id: t.id,
    source: t.from,
    target: t.to,
    label: t.action,
    data: { action: t.action, role: t.role, guard: t.guard, i18n: t.i18n },
    ...EDGE_PRESENTATION,
  }));
  return {
    meta: {
      id: def.id,
      title: def.title,
      start: def.start,
      i18n: def.i18n,
      defaultLocale: def.defaultLocale,
      locales: def.locales,
    },
    nodes,
    edges,
  };
}

/** xyflow graph -> versioned definition. Reads back only id/position/data. */
export function fromFlow(
  meta: WorkflowMeta,
  nodes: FlowNode[],
  edges: FlowEdge[],
): WorkflowDefinition {
  // Emit keys in the SAME order as workflowNodeSchema (id, status, formId, position, kind,
  // statusCode, i18n, defaultAssignee, gateway) so a round-trip through the server's
  // `migrateWorkflow` (Zod parse → schema key order) byte-matches `JSON.stringify`, keeping the
  // dirty check clean on load.
  // Each optional key is conditionally spread so an absent value emits no key (matching the
  // Zod-parsed baseline).
  const wfNodes: WorkflowNode[] = nodes.map((n) => ({
    id: n.id,
    status: n.data.status,
    ...(n.data.formId ? { formId: n.data.formId } : {}),
    position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
    ...(n.data.kind ? { kind: n.data.kind } : {}),
    ...(n.data.statusCode ? { statusCode: n.data.statusCode } : {}),
    ...(n.data.i18n ? { i18n: n.data.i18n } : {}),
    ...(n.data.defaultAssignee ? { defaultAssignee: n.data.defaultAssignee } : {}),
    ...(n.data.gateway ? { gateway: n.data.gateway } : {}),
  }));
  // Emit keys in workflowTransitionSchema order (id, from, to, action, guard, role, i18n) for the
  // same byte-match reason as nodes — `guard` precedes `role`.
  const transitions: WorkflowTransition[] = edges.map((e) => ({
    id: e.id,
    from: e.source,
    to: e.target,
    action: e.data?.action ?? "next",
    ...(e.data?.guard ? { guard: e.data.guard } : {}),
    ...(e.data?.role ? { role: e.data.role } : {}),
    ...(e.data?.i18n ? { i18n: e.data.i18n } : {}),
  }));
  return {
    workflowVersion: CURRENT_WORKFLOW_VERSION,
    id: meta.id,
    title: meta.title,
    start: meta.start,
    nodes: wfNodes,
    transitions,
    ...(meta.i18n ? { i18n: meta.i18n } : {}),
    ...(meta.defaultLocale ? { defaultLocale: meta.defaultLocale } : {}),
    ...(meta.locales ? { locales: meta.locales } : {}),
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
    ...EDGE_PRESENTATION,
  };
}
