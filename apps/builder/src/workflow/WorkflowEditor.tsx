import { FormRenderer } from "@org/form-renderer-web";
import { type GraphError, type GraphWarning, lintGraph, validateGraph } from "@org/workflow-core";
import {
  STATUS_KINDS,
  type StatusCatalogEntry,
  type StatusKind,
  type WorkflowDefinition,
} from "@org/workflow-schema";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  ConnectionMode,
  Controls,
  type EdgeChange,
  Handle,
  MiniMap,
  type NodeChange,
  type NodeProps,
  type OnBeforeDelete,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import {
  Alert,
  Button,
  Divider,
  Drawer,
  Empty,
  Input,
  List,
  Modal,
  message,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { App } from "../App";
import { useHistory } from "../editor/history";
import { saveForm } from "../workspace/client";
import { newForm } from "../workspace/newForm";
import { WorkflowAiDrawer } from "./ai";
import { FloatingEdge } from "./floating-edge";
import { tidyLayout } from "./layout";
import { type Direction, pickNeighbor } from "./navigate";
import { traceUpstream } from "./path";
import {
  indexStatusCatalog,
  KIND_COLOR,
  KIND_LABEL,
  resolveStatusStyle,
  STATUS_PALETTE,
  useStatusCatalog,
} from "./status-catalog";

/** WE5b: arrow keys → spatial navigation direction. */
const ARROW: Record<string, Direction | undefined> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** WE5b: rows for the "?" keyboard-shortcut cheat sheet. */
const KEY_HELP: [string[], string][] = [
  [["←", "↑", "→", "↓"], "Move selection to the nearest state"],
  [["Enter", "F2"], "Rename the selected state"],
  [["n", "Insert"], "Add a state"],
  [["s"], "Make the selected state the start"],
  [["Delete", "Backspace"], "Delete the selection"],
  [["Esc"], "Clear the selection"],
  [["Ctrl+Z", "Ctrl+Shift+Z"], "Undo / redo"],
  [["?"], "Toggle this help"],
];

import { type UsedForm, usedForms } from "./used-forms";
import { useFormDefinition } from "./useFormDefinition";
import {
  type FlowEdge,
  type FlowEdgeData,
  type FlowNode,
  type FlowNodeData,
  fromFlow,
  newEdge,
  newNode,
  snapshot,
  toFlow,
  type WorkflowMeta,
  type WorkflowSnapshot,
} from "./workflow-model";

/** A bindable form for the node panel's "Bound form" picker. */
export interface WorkflowFormOption {
  id: string;
  title: string;
}

/** Lets the custom node render an inline-rename input when its id is the one being renamed, and
 *  resolve its colour/label against the project status catalog (WE4). */
interface NodeViewCtx {
  renamingNodeId: string | null;
  commitRename: (id: string, status: string) => void;
  cancelRename: () => void;
  /** Project status catalog indexed by code — the node resolves its colour/label from this. */
  byCode: ReadonlyMap<string, StatusCatalogEntry>;
}
const NodeViewContext = createContext<NodeViewCtx>({
  renamingNodeId: null,
  commitRename: () => {},
  cancelRename: () => {},
  byCode: new Map(),
});

const HANDLE_STYLE = {
  width: 9,
  height: 9,
  background: "#1677ff",
  border: "2px solid #fff",
} as const;
const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;

/** Custom state node: status + bound form + a "start" badge, with connect handles on all four
 *  sides (floating edges route to the nearest border) and double-click-to-rename. Memoized per
 *  React Flow's perf guidance so a node only re-renders when its own props/context change. */
const WorkflowNodeView = memo(function WorkflowNodeView({
  id,
  data,
  selected,
}: NodeProps<FlowNode>) {
  const ctx = useContext(NodeViewContext);
  const renaming = ctx.renamingNodeId === id;
  // WE4: resolve label/colour/kind from the project status catalog (falls back to the node's own
  // snapshot when no `statusCode` or the entry was deleted).
  const resolved = resolveStatusStyle(data, ctx.byCode);

  return (
    <div
      style={{
        minWidth: 150,
        // Cap the width so a long status / form id ellipsizes instead of stretching the node
        // (and the whole graph) out of shape.
        maxWidth: 220,
        padding: "8px 12px",
        borderRadius: 8,
        border: `2px solid ${selected ? "#1677ff" : "#d9d9d9"}`,
        // Colour accent driven by the resolved status kind/catalog colour — never stored raw in
        // the contract, so it stays a presentation concern at the editor boundary.
        borderLeft: `6px solid ${resolved.color}`,
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      }}
    >
      {SIDES.map((pos) => (
        // Loose connection mode lets each source handle also accept a drop, so a transition can be
        // drawn from any side to any side.
        <Handle key={pos} id={pos} type="source" position={pos} style={HANDLE_STYLE} />
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {renaming ? (
          <Input
            className="nodrag"
            size="small"
            autoFocus
            defaultValue={data.status}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => ctx.commitRename(id, e.target.value)}
            onPressEnter={(e) => ctx.commitRename(id, (e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") ctx.cancelRename();
            }}
            style={{ width: 130 }}
          />
        ) : (
          <Typography.Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
            {resolved.label || "(unnamed)"}
          </Typography.Text>
        )}
        {resolved.missing && <Tag color="orange">?</Tag>}
        {data.isStart && <Tag color="green">start</Tag>}
      </div>
      <Typography.Text type="secondary" ellipsis style={{ fontSize: 12, display: "block" }}>
        {data.formId ? `form: ${data.formId}` : "no form bound"}
      </Typography.Text>
    </div>
  );
});

const nodeTypes = { workflow: WorkflowNodeView };
const edgeTypes = { floating: FloatingEdge };

export interface WorkflowEditorProps {
  /** The persisted workflow contract to seed the canvas from (loaded by the route). */
  definition: WorkflowDefinition;
  /** Forms in the workflow's project — the node "Bound form" picker is populated from these. */
  formOptions: WorkflowFormOption[];
  /** Project the workflow lives in. Scopes "Tạo form mới" (new forms land here) + the embedded
   *  form builder's preset library. Absent ⇒ create/edit-in-place is disabled. */
  projectId?: string;
  /** Persist the current (validated) definition. Throws on failure; the editor surfaces it. */
  onSave: (def: WorkflowDefinition) => Promise<void>;
  /** Refresh the project's forms cache after a form is created or saved in-place, so the bound-form
   *  picker (and titles) pick up the change. Wired to the project tree invalidation by the route. */
  onFormsChanged?: () => void;
  /** Reports whether the editor has unsaved changes (drives the navigation guard). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Hands a stable save fn up so the guard can "save then proceed". Returns success. */
  provideSave?: (save: () => Promise<boolean>) => void;
}

/** Wrapped in a provider so the toolbar + delete buttons can use `useReactFlow`, and floating
 *  edges can read internal node geometry via `useInternalNode`. */
export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function WorkflowEditorInner({
  definition,
  formOptions,
  projectId,
  onSave,
  onFormsChanged,
  onDirtyChange,
  provideSave,
}: WorkflowEditorProps) {
  // Seed once from the loaded definition; the route remounts (key={workflowId}) to switch workflows.
  // Auto-tidy on load ONLY when no node carries a saved position (a fresh / AI-generated graph),
  // so a layout the user already arranged and saved is never overridden.
  const seed = useMemo(() => {
    const flow = toFlow(definition);
    const needsTidy = flow.nodes.length > 0 && definition.nodes.every((n) => !n.position);
    return needsTidy ? { ...flow, nodes: tidyLayout(flow.nodes, flow.edges) } : flow;
  }, [definition]);
  const [meta, setMeta] = useState<WorkflowMeta>(seed.meta);
  const [nodes, setNodes] = useNodesState<FlowNode>(seed.nodes);
  const [edges, setEdges] = useEdgesState<FlowEdge>(seed.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  // WE5b keyboard-first: the "?" shortcut overlay.
  const [showKeyHelp, setShowKeyHelp] = useState(false);
  const { deleteElements, screenToFlowPosition, fitView, setCenter, getZoom } = useReactFlow();

  // WE4 status catalog: project-scoped master data (`global ∪ thisProject`). Nodes resolve their
  // colour/label from this; the picker + manager read/write it. Indexed by code for O(1) lookups.
  const catalog = useStatusCatalog(projectId);
  const byCode = useMemo(() => indexStatusCatalog(catalog.entries), [catalog.entries]);

  // --- Undo/redo over committed {meta,nodes,edges} snapshots (reuses the value-generic History<T>).
  // The live xyflow state above stays the rendering source of truth; history records/restores it.
  const history = useHistory<WorkflowSnapshot>(() => snapshot(seed.meta, seed.nodes, seed.edges));
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  // Record the current (or an explicitly-provided) editor state as one undo step. Callers that
  // mutate one dimension pass just that slice; the others are read from the live refs.
  const commit = useCallback(
    (
      label: string,
      next?: { meta?: WorkflowMeta; nodes?: FlowNode[]; edges?: FlowEdge[] },
      coalesce?: string,
    ) => {
      history.set(
        snapshot(
          next?.meta ?? metaRef.current,
          next?.nodes ?? nodesRef.current,
          next?.edges ?? edgesRef.current,
        ),
        label,
        coalesce,
      );
    },
    [history],
  );

  // Collapse the burst of change events from one gesture (a drag, a cascading delete that emits
  // both node and edge removals) into a SINGLE undo step: schedule one commit after the frame
  // settles, reading the freshest live state. Re-entrant calls just update the pending label.
  const pendingCommit = useRef<string | null>(null);
  const scheduleCommit = useCallback(
    (label: string) => {
      if (pendingCommit.current !== null) {
        pendingCommit.current = label;
        return;
      }
      pendingCommit.current = label;
      requestAnimationFrame(() => {
        const pending = pendingCommit.current;
        pendingCommit.current = null;
        if (pending !== null) commit(pending);
      });
    },
    [commit],
  );

  // Apply xyflow's own change pipeline to the live state, committing only on the changes that
  // matter for undo: a finished drag and any removal (selection / measurement noise is silent).
  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const next = applyNodeChanges(changes, nodesRef.current);
      setNodes(next);
      const removed = changes.some((c) => c.type === "remove");
      const dragEnded = changes.some((c) => c.type === "position" && c.dragging === false);
      if (removed || dragEnded) scheduleCommit(removed ? "Delete" : "Move state");
    },
    [setNodes, scheduleCommit],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      setEdges((es) => applyEdgeChanges(changes, es));
      if (changes.some((c) => c.type === "remove")) scheduleCommit("Delete");
    },
    [setEdges, scheduleCommit],
  );

  // Restore a recorded snapshot into the live state (undo/redo). Fresh object copies so xyflow
  // re-measures cleanly; in-flight rename is cancelled because the node may no longer exist.
  const restore = useCallback(
    (snap: WorkflowSnapshot) => {
      setMeta(snap.meta);
      setNodes(snap.nodes.map((n) => ({ ...n })));
      setEdges(snap.edges.map((e) => ({ ...e })));
      setRenamingNodeId(null);
    },
    [setNodes, setEdges],
  );
  const undo = useCallback(() => {
    if (!history.canUndo) return;
    restore(history.entries[history.index - 1].value);
    history.undo();
  }, [history, restore]);
  const redo = useCallback(() => {
    if (!history.canRedo) return;
    restore(history.entries[history.index + 1].value);
    history.redo();
  }, [history, restore]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;

  // The current definition + dirty signal (vs. the last-saved baseline, compared by JSON).
  const currentDef = useMemo(() => fromFlow(meta, nodes, edges), [meta, nodes, edges]);

  // Workflow-scoped multi-form view (WE3): which forms this workflow uses, grouped by state, plus
  // the states still missing a form. Pure derivation from the live nodes + project form list.
  const formsView = useMemo(
    () => usedForms(currentDef.nodes, formOptions),
    [currentDef.nodes, formOptions],
  );
  const savedJsonRef = useRef(JSON.stringify(definition));
  const dirty = JSON.stringify(currentDef) !== savedJsonRef.current;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Keep the latest definition in a ref so the stable save fn never reads a stale closure.
  const defRef = useRef(currentDef);
  defRef.current = currentDef;

  const save = useCallback(async (): Promise<boolean> => {
    const def = defRef.current;
    const errors = validateGraph(def);
    if (errors.length > 0) {
      message.error(errors.map((e) => e.message).join(" • "));
      return false;
    }
    try {
      await onSave(def);
      savedJsonRef.current = JSON.stringify(def);
      onDirtyChange?.(false);
      message.success("Workflow saved");
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    }
  }, [onSave, onDirtyChange]);

  useEffect(() => {
    provideSave?.(save);
  }, [provideSave, save]);

  // Drop selection / highlight that point at a node or edge which no longer exists (after a
  // delete or an undo/redo restore). Functional updates no-op when nothing changed.
  useEffect(() => {
    setSelectedNodeId((id) => (id && nodes.some((n) => n.id === id) ? id : null));
    setHighlightNodeId((id) => (id && nodes.some((n) => n.id === id) ? id : null));
  }, [nodes]);
  useEffect(() => {
    setSelectedEdgeId((id) => (id && edges.some((e) => e.id === id) ? id : null));
  }, [edges]);

  // Undo/redo keyboard shortcuts, suppressed while typing in a real control (panel/title inputs).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // WE5b keyboard-first: arrow-navigate selection + add/start/rename/help WITHOUT Ctrl/Meta (those
  // stay with undo/redo above). A ref carries the freshest closure so the window listener subscribes
  // once yet always sees the current nodes/selection. Suppressed while typing in a real control.
  const onNavKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onNavKeyRef.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const dir = ARROW[e.key];
    if (dir) {
      e.preventDefault();
      // From a node: nearest neighbour in that direction. From nothing selected: jump to the start.
      const next = pickNeighbor(nodes, selectedNodeId, dir) ?? (selectedNodeId ? null : meta.start);
      if (next) selectNode(next);
      return;
    }
    switch (e.key) {
      case "Enter":
      case "F2":
        if (selectedNodeId) {
          e.preventDefault();
          setRenamingNodeId(selectedNodeId);
        }
        break;
      case "n":
      case "N":
      case "Insert":
        e.preventDefault();
        addState();
        break;
      case "s":
      case "S":
        if (selectedNodeId) {
          e.preventDefault();
          setStart(selectedNodeId);
        }
        break;
      case "Escape":
        // Inline rename owns its own Esc; only clear selection when not renaming.
        if (renamingNodeId === null) {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
          setHighlightNodeId(null);
          setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
        }
        break;
      case "?":
        e.preventDefault();
        setShowKeyHelp((v) => !v);
        break;
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => onNavKeyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const onConnect = useCallback(
    (c: Connection) => {
      const { source, target } = c;
      if (!source || !target) return;
      const next = addEdge(newEdge(source, target, "next"), edgesRef.current);
      setEdges(next);
      commit("Add transition", { edges: next });
    },
    [setEdges, commit],
  );

  function addStateAt(position: { x: number; y: number }) {
    const node = newNode(`state${nodes.length + 1}`, position);
    const next = [...nodes, node];
    setNodes(next);
    commit("Add state", { nodes: next });
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }

  function addState() {
    // Drop the new state beside the selected one, else step it out so it never lands on another.
    const base = selectedNode?.position ?? { x: 40, y: 40 };
    addStateAt({ x: base.x + 220, y: base.y + (selectedNode ? 0 : nodes.length * 30) });
  }

  function onPaneDoubleClick(e: React.MouseEvent) {
    // Add a state where the user double-clicks the empty canvas. Ignore double-clicks that land on
    // a node (handled as inline-rename), an edge, a handle, or the controls. `zoomOnDoubleClick` is
    // disabled on <ReactFlow> so d3-zoom no longer swallows this event before it bubbles here.
    const el = e.target as HTMLElement;
    if (
      el.closest(".react-flow__node, .react-flow__edge, .react-flow__handle, .react-flow__controls")
    ) {
      return;
    }
    addStateAt(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }

  const patchNodeData = useCallback(
    (id: string, patch: Partial<FlowNodeData>) => {
      const next = nodesRef.current.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
      );
      setNodes(next);
      // Coalesce a run of edits to the same node (e.g. typing a status) into one undo step.
      commit("Edit state", { nodes: next }, `node:${id}`);
    },
    [setNodes, commit],
  );

  function patchEdge(id: string, patch: Partial<FlowEdgeData>) {
    const next = edgesRef.current.map((e) =>
      e.id === id
        ? {
            ...e,
            data: { ...e.data, ...patch } as FlowEdgeData,
            label: patch.action ?? e.data?.action ?? e.label,
          }
        : e,
    );
    setEdges(next);
    commit("Edit transition", { edges: next }, `edge:${id}`);
  }

  const setStart = useCallback(
    (id: string) => {
      const nextMeta = { ...metaRef.current, start: id };
      const nextNodes = nodesRef.current.map((n) => ({
        ...n,
        data: { ...n.data, isStart: n.id === id },
      }));
      setMeta(nextMeta);
      setNodes(nextNodes);
      commit("Set start", { meta: nextMeta, nodes: nextNodes });
    },
    [setNodes, commit],
  );

  // WE5b: move keyboard selection onto `id`. Mirrors a mouse click (panel + highlight) AND sets the
  // xyflow `selected` flag — the flag react-flow reads for Delete and the selection ring, which a
  // panel-only click never set (the WE1 keyboard-Delete quirk). `selected` stays out of the contract
  // (`fromFlow` reads back only id/position/data) so this never dirties the doc. Keeps the node in view.
  function selectNode(id: string) {
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    setHighlightNodeId(id);
    setNodes((ns) =>
      ns.map((n) => (!!n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })),
    );
    const node = nodes.find((n) => n.id === id);
    if (node) {
      const w = node.measured?.width ?? node.width ?? 220;
      const h = node.measured?.height ?? node.height ?? 60;
      setCenter(node.position.x + w / 2, node.position.y + h / 2, {
        zoom: getZoom(),
        duration: 200,
      });
    }
  }

  // Inline rename — commit writes back through the same channel as the panel's Status field.
  const commitRename = useCallback(
    (id: string, status: string) => {
      const next = status.trim();
      if (next) patchNodeData(id, { status: next });
      setRenamingNodeId(null);
    },
    [patchNodeData],
  );
  const cancelRename = useCallback(() => setRenamingNodeId(null), []);
  const nodeViewCtx = useMemo<NodeViewCtx>(
    () => ({ renamingNodeId, commitRename, cancelRename, byCode }),
    [renamingNodeId, commitRename, cancelRename, byCode],
  );

  // Guard destructive deletes: never strand the graph or orphan the start node.
  const onBeforeDelete = useCallback<OnBeforeDelete<FlowNode, FlowEdge>>(
    async ({ nodes: del }) => {
      if (del.length === 0) return true;
      const remaining = nodes.filter((n) => !del.some((d) => d.id === n.id));
      if (remaining.length === 0) {
        message.warning("Workflow cần ít nhất một state.");
        return false;
      }
      if (del.some((d) => d.id === meta.start)) {
        message.warning("Hãy đặt một state khác làm 'start' trước khi xoá state bắt đầu.");
        return false;
      }
      return true;
    },
    [nodes, meta.start],
  );

  const onNodesDelete = useCallback(
    (deleted: FlowNode[]) => {
      const ids = new Set(deleted.map((n) => n.id));
      if (selectedNodeId && ids.has(selectedNodeId)) setSelectedNodeId(null);
      if (renamingNodeId && ids.has(renamingNodeId)) setRenamingNodeId(null);
      // start is protected by onBeforeDelete, but re-point defensively if it ever slips through.
      if (ids.has(meta.start)) {
        const fallback = nodes.find((n) => !ids.has(n.id));
        if (fallback) setStart(fallback.id);
      }
    },
    [selectedNodeId, renamingNodeId, meta.start, nodes, setStart],
  );

  const onEdgesDelete = useCallback(
    (deleted: FlowEdge[]) => {
      if (selectedEdgeId && deleted.some((e) => e.id === selectedEdgeId)) setSelectedEdgeId(null);
    },
    [selectedEdgeId],
  );

  function onTidy() {
    const next = tidyLayout(nodesRef.current, edgesRef.current);
    setNodes(next);
    commit("Tidy layout", { nodes: next });
    window.requestAnimationFrame(() => fitView({ duration: 300, padding: 0.2 }));
  }

  function onValidate() {
    if (issues.length === 0) {
      if (warnings.length > 0) {
        message.info(`Hợp lệ — ${warnings.length} cảnh báo (không chặn lưu), xem panel bên phải.`);
      } else {
        message.success("Workflow graph is valid");
      }
      return;
    }
    message.warning(`${issues.length} vấn đề cần xử lý — xem danh sách ở panel bên phải.`);
    if (issues[0].ref) focusRef(issues[0].ref);
  }

  // Apply an AI proposal (C3): replace the whole graph with the generated definition. We KEEP the
  // current persisted workflow id (the upsert key) and take structure/title/start from the proposal.
  // The model emits no node positions, so tidy-layout the seeded graph and fit it into view.
  const applyGenerated = useCallback(
    (def: WorkflowDefinition) => {
      const gen = toFlow(def);
      const nextMeta = { ...gen.meta, id: metaRef.current.id };
      const nextNodes = tidyLayout(gen.nodes, gen.edges);
      setMeta(nextMeta);
      setNodes(nextNodes);
      setEdges(gen.edges);
      commit("Generate with AI", { meta: nextMeta, nodes: nextNodes, edges: gen.edges });
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      window.requestAnimationFrame(() => fitView({ duration: 300, padding: 0.2 }));
    },
    [setNodes, setEdges, commit, fitView],
  );

  // --- Validation issue mapping --------------------------------------------
  // Run the engine's structural checks (validateGraph → GraphError.ref) live, so a flagged node/
  // edge is ringed in red and listed in an errors panel the user can click to focus. This is the
  // production pattern for graph editors (highlight + errors list before publish) and reuses the
  // SAME validation the engine runs — no second source of truth.
  const issues = useMemo(() => validateGraph(currentDef), [currentDef]);
  const errorRefs = useMemo(() => {
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    for (const issue of issues) {
      if (!issue.ref) continue;
      if (issue.code === "dangling-transition") edgeIds.add(issue.ref);
      else nodeIds.add(issue.ref);
    }
    return { nodeIds, edgeIds };
  }, [issues]);

  // Advisory lint (non-blocking): `lintGraph` flags "runnable but probably a mistake" graphs. Kept
  // separate from the blocking `validateGraph` errors above — warnings get an amber ring and a panel
  // section but NEVER gate save. Both new codes reference a node, so an amber node-id set suffices.
  const warnings = useMemo(() => lintGraph(currentDef), [currentDef]);
  const warnNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const w of warnings) {
      // Errors win the colour — don't amber-ring a node already ringed red.
      if (w.ref && !errorRefs.nodeIds.has(w.ref)) ids.add(w.ref);
    }
    return ids;
  }, [warnings, errorRefs]);

  // --- Highlight path -------------------------------------------------------
  // Clicking a state lights every transition that can reach it (back to the start) and dims the
  // rest, so a reviewer can follow one approval path through a busy graph. Pure derivation — the
  // emphasis lives only in the rendered copies, never in the live state or the saved contract.
  const highlight = useMemo(
    () => (highlightNodeId ? traceUpstream(highlightNodeId, edges) : null),
    [highlightNodeId, edges],
  );
  const displayNodes = useMemo(() => {
    if (!highlight && errorRefs.nodeIds.size === 0 && warnNodeIds.size === 0) return nodes;
    return nodes.map((n) => {
      const isError = errorRefs.nodeIds.has(n.id);
      const isWarn = !isError && warnNodeIds.has(n.id);
      const dimmed = highlight ? !highlight.nodeIds.has(n.id) : false;
      if (!isError && !isWarn && !dimmed) return n;
      return {
        ...n,
        style: {
          ...n.style,
          ...(dimmed ? { opacity: 0.25 } : {}),
          // Red ring = blocking validator error (duplicate / unreachable / missing start).
          // Amber ring = advisory lint warning (dead-end / end-has-outgoing) — does NOT block save.
          ...(isError
            ? { boxShadow: "0 0 0 2px #ff4d4f", borderRadius: 8 }
            : isWarn
              ? { boxShadow: "0 0 0 2px #faad14", borderRadius: 8 }
              : {}),
        },
      };
    });
  }, [nodes, highlight, errorRefs, warnNodeIds]);
  const displayEdges = useMemo(() => {
    if (!highlight && errorRefs.edgeIds.size === 0) return edges;
    return edges.map((e) => {
      const isError = errorRefs.edgeIds.has(e.id);
      const onPath = highlight ? highlight.edgeIds.has(e.id) : false;
      const dimmed = highlight ? !onPath : false;
      if (!isError && !dimmed && !onPath) return e;
      return {
        ...e,
        style: {
          ...e.style,
          ...(onPath ? { stroke: "#1677ff", strokeWidth: 2 } : {}),
          ...(dimmed ? { opacity: 0.2 } : {}),
          ...(isError ? { stroke: "#ff4d4f", strokeWidth: 2 } : {}),
        },
      };
    });
  }, [edges, highlight, errorRefs]);

  // Select + center a flagged node/edge when its issue is clicked in the errors panel.
  const focusRef = useCallback(
    (ref: string) => {
      if (nodes.some((n) => n.id === ref)) {
        setSelectedNodeId(ref);
        setSelectedEdgeId(null);
        setHighlightNodeId(null);
        fitView({ nodes: [{ id: ref }], duration: 300, padding: 0.6, maxZoom: 1.2 });
      } else if (edges.some((e) => e.id === ref)) {
        setSelectedEdgeId(ref);
        setSelectedNodeId(null);
        setHighlightNodeId(null);
      }
    },
    [nodes, edges, fitView],
  );

  // --- Inline form integration (WF2b) ---------------------------------------
  // Editing/creating a node's bound form happens in a Drawer over the canvas (the full `App`
  // builder) — never navigating away from the workflow.
  const [editingFormId, setEditingFormId] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const canManageForms = !!projectId;

  // Create a blank form in the workflow's project, bind it to the node, and open it in the Drawer.
  const createFormForNode = useCallback(
    async (nodeId: string, title: string) => {
      if (!projectId) return;
      setCreating(true);
      try {
        const saved = await saveForm(newForm(title), { projectId });
        patchNodeData(nodeId, { formId: saved.id });
        onFormsChanged?.(); // refresh the picker so the new form is a real option
        setFormDirty(false);
        setEditingFormId(saved.id);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setCreating(false);
      }
    },
    [projectId, patchNodeData, onFormsChanged],
  );

  // After a save inside the Drawer, App's own persistence already invalidated `qk.form(id)` (so the
  // node preview refetches); we only refresh the project tree so titles stay in sync.
  const onEmbeddedFormSaved = useCallback(() => {
    setFormDirty(false);
    onFormsChanged?.();
  }, [onFormsChanged]);

  function closeFormDrawer() {
    if (formDirty) {
      Modal.confirm({
        title: "Form chưa lưu",
        content: "Đóng trình chỉnh sửa form? Các thay đổi chưa lưu sẽ mất.",
        okText: "Đóng",
        okButtonProps: { danger: true },
        cancelText: "Tiếp tục sửa",
        onOk: () => {
          setFormDirty(false);
          setEditingFormId(null);
        },
      });
      return;
    }
    setEditingFormId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <Input
          value={meta.title}
          onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
          placeholder="workflow title"
          style={{ width: 240 }}
        />
        <Space style={{ marginLeft: "auto" }}>
          <Button onClick={() => setAiOpen(true)}>✨ Generate with AI</Button>
          <Button onClick={() => setFormsOpen(true)}>Forms ({formsView.forms.length})</Button>
          <Button onClick={() => setStatusOpen(true)}>Statuses ({catalog.entries.length})</Button>
          <Button onClick={undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)">
            Undo
          </Button>
          <Button onClick={redo} disabled={!history.canRedo} title="Redo (Ctrl+Shift+Z)">
            Redo
          </Button>
          <Button onClick={addState}>Add state</Button>
          <Button onClick={onTidy}>Tidy</Button>
          <Button danger={issues.length > 0} onClick={onValidate}>
            {issues.length > 0 ? `Validate (${issues.length})` : "Validate"}
          </Button>
          <Button type="primary" disabled={!dirty} onClick={save}>
            Save
          </Button>
        </Space>
      </div>

      <WorkflowAiDrawer
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        currentWorkflow={currentDef}
        onApply={applyGenerated}
      />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: pane double-click is a canvas affordance. */}
        <div style={{ flex: 1, minWidth: 0 }} onDoubleClick={onPaneDoubleClick}>
          <NodeViewContext.Provider value={nodeViewCtx}>
            <ReactFlow
              nodes={displayNodes}
              edges={displayEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionMode={ConnectionMode.Loose}
              zoomOnDoubleClick={false}
              // WE5b: arrow keys drive our spatial node-navigation, not xyflow's built-in
              // a11y node-nudging — otherwise arrows would move the selected node by 1px.
              disableKeyboardA11y
              deleteKeyCode={["Delete", "Backspace"]}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onBeforeDelete={onBeforeDelete}
              onNodesDelete={onNodesDelete}
              onEdgesDelete={onEdgesDelete}
              onNodeClick={(_, n) => {
                setSelectedNodeId(n.id);
                setSelectedEdgeId(null);
                setHighlightNodeId(n.id);
              }}
              onNodeDoubleClick={(_, n) => setRenamingNodeId(n.id)}
              onEdgeClick={(_, e) => {
                setSelectedEdgeId(e.id);
                setSelectedNodeId(null);
                setHighlightNodeId(null);
              }}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
                setHighlightNodeId(null);
              }}
              fitView
            >
              <Background />
              <MiniMap pannable zoomable />
              <Controls />
            </ReactFlow>
          </NodeViewContext.Provider>
        </div>

        <aside
          style={{
            width: 320,
            borderLeft: "1px solid rgba(0,0,0,0.08)",
            padding: 16,
            overflow: "auto",
          }}
        >
          {selectedNode ? (
            <NodePanel
              node={selectedNode}
              isStart={meta.start === selectedNode.id}
              formOptions={formOptions}
              statusEntries={catalog.entries}
              onManageStatuses={() => setStatusOpen(true)}
              canManageForms={canManageForms}
              creating={creating}
              onChange={(patch) => patchNodeData(selectedNode.id, patch)}
              onSetStart={() => setStart(selectedNode.id)}
              onEditForm={(formId) => {
                setFormDirty(false);
                setEditingFormId(formId);
              }}
              onCreateForm={(title) => createFormForNode(selectedNode.id, title)}
              onDelete={() => deleteElements({ nodes: [{ id: selectedNode.id }] })}
            />
          ) : selectedEdge ? (
            <EdgePanel
              edge={selectedEdge}
              onChange={(patch) => patchEdge(selectedEdge.id, patch)}
              onDelete={() => deleteElements({ edges: [{ id: selectedEdge.id }] })}
            />
          ) : issues.length > 0 || warnings.length > 0 ? (
            <IssuesPanel issues={issues} warnings={warnings} onFocus={focusRef} />
          ) : (
            <Typography.Paragraph type="secondary">
              Select a state or transition to edit it. Drag from any handle to another node to
              create a transition. Double-click the canvas to add a state, or a node to rename it.
              Press Delete/Backspace to remove the selection. Undo/redo with Ctrl+Z / Ctrl+Shift+Z.
              Navigate with the arrow keys — press <kbd>?</kbd> for all keyboard shortcuts.
            </Typography.Paragraph>
          )}
        </aside>
      </div>

      {/* WE5b: keyboard-shortcut cheat sheet, toggled with "?". Purely presentational. */}
      <Modal
        open={showKeyHelp}
        onCancel={() => setShowKeyHelp(false)}
        title="Keyboard shortcuts"
        footer={null}
      >
        <List
          size="small"
          dataSource={KEY_HELP}
          renderItem={([keys, desc]) => (
            <List.Item>
              <span style={{ minWidth: 160 }}>
                {keys.map((k) => (
                  <kbd key={k} style={{ marginRight: 4 }}>
                    {k}
                  </kbd>
                ))}
              </span>
              <span style={{ flex: 1, textAlign: "right", color: "#888" }}>{desc}</span>
            </List.Item>
          )}
        />
      </Modal>

      {/* Workflow-scoped multi-form overview (WE3): every form this workflow uses, grouped by the
          states that bind it, plus the states still missing a form. Jump to a state or open the
          builder Drawer for a form without leaving the workflow. */}
      <Drawer
        open={formsOpen}
        onClose={() => setFormsOpen(false)}
        title="Forms trong workflow"
        width={380}
      >
        <UsedFormsPanel
          forms={formsView.forms}
          unbound={formsView.unbound}
          canManageForms={canManageForms}
          onFocusState={(id) => {
            setFormsOpen(false);
            focusRef(id);
          }}
          onEditForm={(formId) => {
            setFormsOpen(false);
            setFormDirty(false);
            setEditingFormId(formId);
          }}
        />
      </Drawer>

      {/* Status catalog manager (WE4): project-scoped master data the editor resolves node colours
          against. Create/edit/delete custom statuses (label + kind + optional colour) and promote a
          project status to global. Reused live by every node + the picker. */}
      <Drawer
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Status catalog"
        width={420}
      >
        <StatusCatalogPanel
          entries={catalog.entries}
          loading={catalog.loading}
          canManage={canManageForms}
          projectId={projectId}
          onSave={catalog.save}
          onRemove={catalog.remove}
          onPromote={catalog.promote}
        />
      </Drawer>

      {/* Edit/create a node's bound form in place — the full builder, no navigation away. App is
          standalone-renderable and uses callback-based guards (no competing `useBlocker`); we clip
          its 100vh layout to the drawer body and confirm on close when the form has unsaved edits. */}
      <Drawer
        open={!!editingFormId}
        onClose={closeFormDrawer}
        title="Chỉnh sửa form"
        width="70vw"
        destroyOnClose
        styles={{ body: { padding: 0, overflow: "hidden" } }}
      >
        {editingFormId && (
          <App
            key={editingFormId}
            formId={editingFormId}
            projectId={projectId}
            onSaved={onEmbeddedFormSaved}
            onDirtyChange={setFormDirty}
          />
        )}
      </Drawer>
    </div>
  );
}

function NodePanel({
  node,
  isStart,
  formOptions,
  statusEntries,
  onManageStatuses,
  canManageForms,
  creating,
  onChange,
  onSetStart,
  onEditForm,
  onCreateForm,
  onDelete,
}: {
  node: FlowNode;
  isStart: boolean;
  formOptions: WorkflowFormOption[];
  /** The project status catalog (`global ∪ thisProject`) the "Status" picker chooses from. */
  statusEntries: StatusCatalogEntry[];
  /** Open the status catalog manager Drawer. */
  onManageStatuses: () => void;
  /** Project context present ⇒ create/edit-in-place is available. */
  canManageForms: boolean;
  /** A new form is being created + bound (disables the create action). */
  creating: boolean;
  onChange: (patch: Partial<FlowNodeData>) => void;
  onSetStart: () => void;
  /** Open the bound form in the in-canvas edit Drawer. */
  onEditForm: (formId: string) => void;
  /** Create a blank form titled after the state, bind it, and open the Drawer. */
  onCreateForm: (title: string) => void;
  onDelete: () => void;
}) {
  const boundFormId = node.data.formId;
  const formExists = !boundFormId || formOptions.some((f) => f.id === boundFormId);
  // A bound form that no longer exists in the project still shows as a (dangling) option.
  const options = formOptions.map((f) => ({ value: f.id, label: f.title }));
  if (boundFormId && !formExists) {
    options.push({ value: boundFormId, label: `${boundFormId} (missing)` });
  }

  const statusCode = node.data.statusCode;
  const linked = statusCode ? statusEntries.find((e) => e.code === statusCode) : undefined;
  const linkedMissing = statusCode != null && linked === undefined;
  // Picking a catalog status denormalizes a frozen snapshot onto the node (label + kind), so a later
  // catalog deletion leaves the node coloured + labelled (the W4 linked-field fallback).
  function pickStatus(code: string | undefined) {
    const entry = code ? statusEntries.find((e) => e.code === code) : undefined;
    if (entry) onChange({ statusCode: entry.code, kind: entry.kind, status: entry.label });
    else onChange({ statusCode: undefined });
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Typography.Title level={5} style={{ margin: 0 }}>
        State
      </Typography.Title>
      <Field label="Trạng thái (catalog)">
        <Select
          style={{ width: "100%" }}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Chọn trạng thái dùng chung"
          value={statusCode}
          onChange={(value) => pickStatus(value || undefined)}
          options={statusEntries.map((e) => ({
            value: e.code,
            label: e.label,
            kind: e.kind,
            color: e.color ?? KIND_COLOR[e.kind],
          }))}
          optionRender={(opt) => (
            <Space>
              <ColorDot color={(opt.data as { color: string }).color} />
              <span>{opt.data.label}</span>
              <Tag style={{ marginInlineEnd: 0 }}>
                {KIND_LABEL[(opt.data as { kind: StatusKind }).kind]}
              </Tag>
            </Space>
          )}
          notFoundContent="Chưa có trạng thái nào trong catalog"
        />
        <div style={{ marginTop: 6 }}>
          {linkedMissing && (
            <Tag color="orange" style={{ marginInlineEnd: 8 }}>
              trạng thái đã bị xoá khỏi catalog
            </Tag>
          )}
          <Button type="link" size="small" style={{ padding: 0 }} onClick={onManageStatuses}>
            Quản lý catalog…
          </Button>
        </div>
      </Field>
      <Field label={statusCode ? "Nhãn (snapshot dự phòng)" : "Nhãn trạng thái"}>
        <Input value={node.data.status} onChange={(e) => onChange({ status: e.target.value })} />
      </Field>
      {!statusCode && (
        <Field label="Loại (màu)">
          <Select
            style={{ width: "100%" }}
            allowClear
            placeholder="Mặc định (Thường)"
            value={node.data.kind}
            onChange={(value) => onChange({ kind: (value as StatusKind) || undefined })}
            options={STATUS_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            optionRender={(opt) => (
              <Space>
                <ColorDot color={KIND_COLOR[opt.value as StatusKind]} />
                <span>{opt.data.label}</span>
              </Space>
            )}
          />
        </Field>
      )}
      <Field label="Bound form">
        <Select
          style={{ width: "100%" }}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Chọn form trong dự án"
          value={boundFormId}
          options={options}
          onChange={(value) => onChange({ formId: value || undefined })}
          notFoundContent="Dự án chưa có form nào"
        />
      </Field>

      <BoundFormPreview
        formId={boundFormId}
        missing={!!boundFormId && !formExists}
        canManageForms={canManageForms}
        creating={creating}
        onEditForm={onEditForm}
        onCreateForm={() => onCreateForm(node.data.status || "Form")}
      />

      <Button block disabled={isStart} onClick={onSetStart}>
        {isStart ? "This is the start state" : "Set as start"}
      </Button>
      <Button block danger disabled={isStart} onClick={onDelete}>
        Delete state
      </Button>
    </Space>
  );
}

/** Read-only preview of a node's bound form + the create/edit actions. When a form is bound it
 *  renders the real `FormRenderer` (review mode) in a scroll-capped box; otherwise it offers
 *  "Tạo form mới" (the picker above already covers selecting an existing one). */
function BoundFormPreview({
  formId,
  missing,
  canManageForms,
  creating,
  onEditForm,
  onCreateForm,
}: {
  formId?: string;
  missing: boolean;
  canManageForms: boolean;
  creating: boolean;
  onEditForm: (formId: string) => void;
  onCreateForm: () => void;
}) {
  const { definition, loading, error } = useFormDefinition(missing ? undefined : formId);

  if (!formId) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="Chưa gắn form"
        style={{ margin: "8px 0" }}
      >
        {canManageForms && (
          <Button type="primary" loading={creating} onClick={onCreateForm}>
            Tạo form mới
          </Button>
        )}
      </Empty>
    );
  }

  return (
    <Field label="Xem trước form">
      <div
        style={{
          maxHeight: 280,
          overflow: "auto",
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 8,
          padding: 12,
          background: "#fafafa",
        }}
      >
        {missing ? (
          <Alert
            type="warning"
            showIcon
            message="Form không còn tồn tại"
            description="Form được gắn đã bị xoá khỏi dự án. Hãy chọn hoặc tạo form khác."
          />
        ) : loading ? (
          <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
            <Spin />
          </div>
        ) : error ? (
          <Alert type="error" showIcon message="Không tải được form" description={error} />
        ) : definition ? (
          <FormRenderer schema={definition} designMode readPretty />
        ) : null}
      </div>
      <Button
        block
        type="primary"
        style={{ marginTop: 8 }}
        disabled={missing || !canManageForms}
        onClick={() => onEditForm(formId)}
      >
        Sửa form
      </Button>
    </Field>
  );
}

function EdgePanel({
  edge,
  onChange,
  onDelete,
}: {
  edge: FlowEdge;
  onChange: (patch: Partial<FlowEdgeData>) => void;
  onDelete: () => void;
}) {
  const [guardText, setGuardText] = useState(() =>
    edge.data?.guard ? JSON.stringify(edge.data.guard.rule, null, 2) : "",
  );
  const [guardError, setGuardError] = useState<string | null>(null);

  function onGuardChange(text: string) {
    setGuardText(text);
    if (text.trim() === "") {
      setGuardError(null);
      onChange({ guard: undefined });
      return;
    }
    try {
      const rule = JSON.parse(text) as Record<string, unknown>;
      setGuardError(null);
      onChange({ guard: { rule } });
    } catch (e) {
      setGuardError((e as Error).message);
    }
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Typography.Title level={5} style={{ margin: 0 }}>
        Transition
      </Typography.Title>
      <Field label="Action (event)">
        <Input
          value={edge.data?.action ?? ""}
          onChange={(e) => onChange({ action: e.target.value })}
        />
      </Field>
      <Field label="Required role (optional)">
        <Input
          value={edge.data?.role ?? ""}
          placeholder="e.g. manager"
          onChange={(e) => onChange({ role: e.target.value || undefined })}
        />
      </Field>
      <Field label="Guard (JSONLogic rule, optional)">
        <Input.TextArea
          value={guardText}
          onChange={(e) => onGuardChange(e.target.value)}
          placeholder={'{ "==": [{ "var": "approved" }, true] }'}
          autoSize={{ minRows: 3, maxRows: 8 }}
          spellCheck={false}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </Field>
      {guardError && (
        <Alert type="error" showIcon message="Invalid JSON" description={guardError} />
      )}
      <Button block danger onClick={onDelete}>
        Delete transition
      </Button>
      <Divider style={{ margin: 0 }} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {edge.source} → {edge.target}
      </Typography.Text>
    </Space>
  );
}

/** Errors panel: the live `validateGraph` issues (blocking, red) plus `lintGraph` warnings
 *  (advisory, amber — never block save), each a click-to-focus row (the production "highlight node +
 *  list errors before publish" pattern). Shown when nothing is selected. */
function IssuesPanel({
  issues,
  warnings,
  onFocus,
}: {
  issues: GraphError[];
  warnings: GraphWarning[];
  onFocus: (ref: string) => void;
}) {
  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      {issues.length > 0 && (
        <>
          <Typography.Title level={5} style={{ margin: 0, color: "#cf1322" }}>
            {issues.length} vấn đề cần xử lý
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Sửa các lỗi sau trước khi lưu/publish. Bấm một mục để nhảy tới node/transition liên
            quan.
          </Typography.Text>
          {issues.map((issue, i) => (
            <Button
              key={`${issue.code}-${issue.ref ?? i}`}
              block
              danger
              disabled={!issue.ref}
              onClick={() => issue.ref && onFocus(issue.ref)}
              style={{
                height: "auto",
                whiteSpace: "normal",
                textAlign: "left",
                padding: "8px 12px",
              }}
            >
              {issue.message}
            </Button>
          ))}
        </>
      )}
      {warnings.length > 0 && (
        <>
          <Typography.Title level={5} style={{ margin: 0, color: "#d48806" }}>
            {warnings.length} cảnh báo (không chặn lưu)
          </Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Gợi ý cải thiện luồng. Bấm một mục để nhảy tới node liên quan.
          </Typography.Text>
          {warnings.map((warn, i) => (
            <Button
              key={`${warn.code}-${warn.ref ?? i}`}
              block
              disabled={!warn.ref}
              onClick={() => warn.ref && onFocus(warn.ref)}
              style={{
                height: "auto",
                whiteSpace: "normal",
                textAlign: "left",
                padding: "8px 12px",
                borderColor: "#faad14",
                color: "#d48806",
              }}
            >
              {warn.message}
            </Button>
          ))}
        </>
      )}
    </Space>
  );
}

/** Workflow-scoped multi-form overview body: forms grouped by the states that bind them, plus a
 *  "states with no form" section. Each form row links to its states and (in a project) opens the
 *  builder Drawer. Pure presentation over the `usedForms` aggregation. */
function UsedFormsPanel({
  forms,
  unbound,
  canManageForms,
  onFocusState,
  onEditForm,
}: {
  forms: UsedForm[];
  unbound: { id: string; status: string }[];
  /** Project context present ⇒ "Sửa form" is available. */
  canManageForms: boolean;
  /** Select + center the given state node (and close this panel). */
  onFocusState: (nodeId: string) => void;
  /** Open the bound form in the builder Drawer. */
  onEditForm: (formId: string) => void;
}) {
  if (forms.length === 0 && unbound.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Workflow chưa có state nào" />;
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="large">
      {forms.length === 0 ? (
        <Typography.Text type="secondary">Chưa có state nào gắn form.</Typography.Text>
      ) : (
        <List
          size="small"
          dataSource={forms}
          renderItem={(f) => (
            <List.Item key={f.formId} style={{ display: "block", padding: "12px 0" }} actions={[]}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Typography.Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
                  {f.title}
                </Typography.Text>
                {f.missing ? (
                  <Tag color="red">đã xoá</Tag>
                ) : (
                  <Tag>
                    {f.states.length} state{f.states.length > 1 ? "s" : ""}
                  </Tag>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {f.states.map((s) => (
                  <Button key={s.id} size="small" onClick={() => onFocusState(s.id)}>
                    {s.status || "(unnamed)"}
                  </Button>
                ))}
              </div>
              <Button
                block
                size="small"
                style={{ marginTop: 8 }}
                disabled={f.missing || !canManageForms}
                onClick={() => onEditForm(f.formId)}
              >
                Sửa form
              </Button>
            </List.Item>
          )}
        />
      )}

      {unbound.length > 0 && (
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {unbound.length} state chưa gắn form
          </Typography.Text>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {unbound.map((s) => (
              <Button key={s.id} size="small" onClick={() => onFocusState(s.id)}>
                {s.status || "(unnamed)"}
              </Button>
            ))}
          </div>
        </div>
      )}
    </Space>
  );
}

/** A small colour swatch used in status pickers and the catalog list. */
function ColorDot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: color,
        border: "1px solid rgba(0,0,0,0.15)",
        flex: "none",
      }}
    />
  );
}

/** A clickable palette swatch (a colour square that rings when selected). */
function Swatch({
  color,
  selected,
  title,
  onClick,
}: {
  color: string;
  selected: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={onClick}
      style={{
        width: 22,
        height: 22,
        padding: 0,
        borderRadius: 6,
        background: color,
        cursor: "pointer",
        border: selected ? "2px solid #1677ff" : "1px solid rgba(0,0,0,0.15)",
        boxShadow: selected ? "0 0 0 2px rgba(22,119,255,0.2)" : "none",
      }}
    />
  );
}

/** Local draft for the catalog create/edit form. */
interface StatusDraft {
  code: string;
  label: string;
  kind: StatusKind;
  /** Custom colour, or `null` to use the kind default. */
  color: string | null;
  global: boolean;
}
const EMPTY_DRAFT: StatusDraft = {
  code: "",
  label: "",
  kind: "normal",
  color: null,
  global: false,
};

/** Status catalog manager (WE4): create/edit/delete project + global statuses, and promote a
 *  project status to global. Master data the editor resolves node colours against — never the
 *  workflow contract. A global-only context (no project) forces `global` scope. */
function StatusCatalogPanel({
  entries,
  loading,
  canManage,
  projectId,
  onSave,
  onRemove,
  onPromote,
}: {
  entries: StatusCatalogEntry[];
  loading: boolean;
  /** Project context present ⇒ project-scoped statuses can be created (else global only). */
  canManage: boolean;
  projectId?: string;
  onSave: (entry: StatusCatalogEntry) => Promise<void>;
  onRemove: (code: string) => Promise<void>;
  onPromote: (code: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<StatusDraft>(EMPTY_DRAFT);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const codeValid = /^[a-zA-Z0-9_-]+$/.test(draft.code);
  const canSubmit = codeValid && draft.label.trim().length > 0 && !busy;

  function reset() {
    setDraft(EMPTY_DRAFT);
    setEditingCode(null);
  }

  function startEdit(entry: StatusCatalogEntry) {
    setEditingCode(entry.code);
    setDraft({
      code: entry.code,
      label: entry.label,
      kind: entry.kind,
      color: entry.color ?? null,
      global: entry.scope !== "project",
    });
  }

  async function submit() {
    if (!canSubmit) return;
    // Global scope (or a project-less context) stores no projectId; project scope pins it.
    const useGlobal = draft.global || !projectId;
    const entry: StatusCatalogEntry = {
      code: draft.code.trim(),
      label: draft.label.trim(),
      kind: draft.kind,
      ...(draft.color ? { color: draft.color } : {}),
      scope: useGlobal ? "global" : "project",
      ...(useGlobal ? {} : { projectId }),
    };
    setBusy(true);
    try {
      await onSave(entry);
      message.success(editingCode ? "Đã cập nhật trạng thái" : "Đã tạo trạng thái");
      reset();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(code: string) {
    setBusy(true);
    try {
      await onRemove(code);
      if (editingCode === code) reset();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function promote(code: string) {
    setBusy(true);
    try {
      await onPromote(code);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Trạng thái dùng chung cho mọi workflow {projectId ? "trong dự án" : ""}. Màu node lấy từ đây
        (hoặc màu mặc định theo loại). Mỗi trạng thái custom map về một loại engine (Bắt đầu /
        Thường / Kết thúc).
      </Typography.Text>

      <div style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 8, padding: 12 }}>
        <Typography.Text strong>
          {editingCode ? `Sửa: ${editingCode}` : "Tạo trạng thái mới"}
        </Typography.Text>
        <Space direction="vertical" style={{ width: "100%", marginTop: 8 }} size="small">
          <Field label="Code (định danh)">
            <Input
              value={draft.code}
              disabled={!!editingCode}
              placeholder="vd: pending"
              status={draft.code && !codeValid ? "error" : undefined}
              onChange={(e) => setDraft((d) => ({ ...d, code: e.target.value }))}
            />
          </Field>
          <Field label="Nhãn">
            <Input
              value={draft.label}
              placeholder="vd: Chờ duyệt"
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            />
          </Field>
          <Field label="Loại (engine)">
            <Select
              style={{ width: "100%" }}
              value={draft.kind}
              onChange={(value) => setDraft((d) => ({ ...d, kind: value }))}
              options={STATUS_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
              optionRender={(opt) => (
                <Space>
                  <ColorDot color={KIND_COLOR[opt.value as StatusKind]} />
                  <span>{opt.data.label}</span>
                </Space>
              )}
            />
          </Field>
          <Field label="Màu">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {/* Auto = use the kind default; the active choice when no custom colour is set. */}
              <Button
                size="small"
                type={draft.color == null ? "primary" : "default"}
                onClick={() => setDraft((d) => ({ ...d, color: null }))}
              >
                <Space size={4}>
                  <ColorDot color={KIND_COLOR[draft.kind]} />
                  Mặc định
                </Space>
              </Button>
              {STATUS_PALETTE.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  title={c}
                  selected={draft.color === c}
                  onClick={() => setDraft((d) => ({ ...d, color: c }))}
                />
              ))}
              {/* Escape hatch for a colour outside the palette. */}
              <input
                type="color"
                title="Màu tuỳ chỉnh"
                value={draft.color ?? KIND_COLOR[draft.kind]}
                onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                style={{
                  width: 28,
                  height: 24,
                  padding: 0,
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: 6,
                  background: "none",
                  cursor: "pointer",
                }}
              />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {draft.color == null
                ? "Dùng màu mặc định theo loại"
                : `Màu tuỳ chỉnh: ${draft.color}`}
            </Typography.Text>
          </Field>
          {projectId && (
            <Field label="Phạm vi">
              <Select
                style={{ width: "100%" }}
                value={draft.global ? "global" : "project"}
                onChange={(value) => setDraft((d) => ({ ...d, global: value === "global" }))}
                options={[
                  { value: "project", label: "Chỉ dự án này" },
                  { value: "global", label: "Dùng chung (mọi dự án)" },
                ]}
              />
            </Field>
          )}
          <Space>
            <Button type="primary" disabled={!canSubmit} loading={busy} onClick={submit}>
              {editingCode ? "Lưu" : "Tạo"}
            </Button>
            {editingCode && <Button onClick={reset}>Huỷ</Button>}
          </Space>
        </Space>
      </div>

      <Divider style={{ margin: 0 }} />

      {loading ? (
        <div style={{ display: "grid", placeItems: "center", padding: 24 }}>
          <Spin />
        </div>
      ) : entries.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có trạng thái nào" />
      ) : (
        <List
          size="small"
          dataSource={entries}
          renderItem={(e) => (
            // Block layout (not the `actions` prop) so the narrow drawer never squeezes the title /
            // wraps it: row 1 = swatch + label + tags, row 2 = code + actions.
            <List.Item key={e.code} style={{ display: "block", padding: "10px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ColorDot color={e.color ?? KIND_COLOR[e.kind]} />
                <Typography.Text strong ellipsis style={{ flex: 1, minWidth: 0 }}>
                  {e.label}
                </Typography.Text>
                <Tag style={{ marginInlineEnd: 0 }}>{KIND_LABEL[e.kind]}</Tag>
                {e.scope === "project" ? (
                  <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                    dự án
                  </Tag>
                ) : (
                  <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                    chung
                  </Tag>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
                <Typography.Text type="secondary" style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                  {e.code}
                </Typography.Text>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: "auto" }}
                  onClick={() => startEdit(e)}
                >
                  Sửa
                </Button>
                {e.scope === "project" && (
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, height: "auto" }}
                    disabled={busy}
                    onClick={() => promote(e.code)}
                  >
                    Dùng chung
                  </Button>
                )}
                <Button
                  type="link"
                  size="small"
                  danger
                  style={{ padding: 0, height: "auto" }}
                  disabled={busy || !canManage}
                  onClick={() => remove(e.code)}
                >
                  Xoá
                </Button>
              </div>
            </List.Item>
          )}
        />
      )}
    </Space>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {label}
      </Typography.Text>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}
