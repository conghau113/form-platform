import { validateGraph } from "@org/workflow-core";
import type { WorkflowDefinition } from "@org/workflow-schema";
import {
  addEdge,
  Background,
  type Connection,
  ConnectionMode,
  Controls,
  Handle,
  type NodeProps,
  type OnBeforeDelete,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { Alert, Button, Divider, Input, message, Select, Space, Tag, Typography } from "antd";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FloatingEdge } from "./floating-edge";
import { tidyLayout } from "./layout";
import {
  type FlowEdge,
  type FlowEdgeData,
  type FlowNode,
  type FlowNodeData,
  fromFlow,
  newEdge,
  newNode,
  toFlow,
  type WorkflowMeta,
} from "./workflow-model";

/** A bindable form for the node panel's "Bound form" picker. */
export interface WorkflowFormOption {
  id: string;
  title: string;
}

/** Lets the custom node render an inline-rename input when its id is the one being renamed. */
interface NodeViewCtx {
  renamingNodeId: string | null;
  commitRename: (id: string, status: string) => void;
  cancelRename: () => void;
}
const NodeViewContext = createContext<NodeViewCtx>({
  renamingNodeId: null,
  commitRename: () => {},
  cancelRename: () => {},
});

const HANDLE_STYLE = {
  width: 9,
  height: 9,
  background: "#1677ff",
  border: "2px solid #fff",
} as const;
const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left] as const;

/** Custom state node: status + bound form + a "start" badge, with connect handles on all four
 *  sides (floating edges route to the nearest border) and double-click-to-rename. */
function WorkflowNodeView({ id, data, selected }: NodeProps<FlowNode>) {
  const ctx = useContext(NodeViewContext);
  const renaming = ctx.renamingNodeId === id;

  return (
    <div
      style={{
        minWidth: 150,
        padding: "8px 12px",
        borderRadius: 8,
        border: `2px solid ${selected ? "#1677ff" : "#d9d9d9"}`,
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
          <Typography.Text strong>{data.status || "(unnamed)"}</Typography.Text>
        )}
        {data.isStart && <Tag color="green">start</Tag>}
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {data.formId ? `form: ${data.formId}` : "no form bound"}
      </Typography.Text>
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNodeView };
const edgeTypes = { floating: FloatingEdge };

export interface WorkflowEditorProps {
  /** The persisted workflow contract to seed the canvas from (loaded by the route). */
  definition: WorkflowDefinition;
  /** Forms in the workflow's project — the node "Bound form" picker is populated from these. */
  formOptions: WorkflowFormOption[];
  /** Persist the current (validated) definition. Throws on failure; the editor surfaces it. */
  onSave: (def: WorkflowDefinition) => Promise<void>;
  /** Open the form builder bound to a node's formId (navigates to the form editor route). */
  onEditForm?: (formId: string) => void;
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
  onSave,
  onEditForm,
  onDirtyChange,
  provideSave,
}: WorkflowEditorProps) {
  // Seed once from the loaded definition; the route remounts (key={workflowId}) to switch workflows.
  const seed = useMemo(() => toFlow(definition), [definition]);
  const [meta, setMeta] = useState<WorkflowMeta>(seed.meta);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(seed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(seed.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const { deleteElements, screenToFlowPosition, fitView } = useReactFlow();

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;

  // The current definition + dirty signal (vs. the last-saved baseline, compared by JSON).
  const currentDef = useMemo(() => fromFlow(meta, nodes, edges), [meta, nodes, edges]);
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

  const onConnect = useCallback(
    (c: Connection) => {
      const { source, target } = c;
      if (!source || !target) return;
      setEdges((eds) => addEdge(newEdge(source, target, "next"), eds));
    },
    [setEdges],
  );

  function addStateAt(position: { x: number; y: number }) {
    const node = newNode(`state${nodes.length + 1}`, position);
    setNodes((ns) => [...ns, node]);
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }

  function addState() {
    // Drop the new state beside the selected one, else step it out so it never lands on another.
    const base = selectedNode?.position ?? { x: 40, y: 40 };
    addStateAt({ x: base.x + 220, y: base.y + (selectedNode ? 0 : nodes.length * 30) });
  }

  function onPaneDoubleClick(e: React.MouseEvent) {
    // Only the empty canvas — a node's own double-click is handled as inline-rename below.
    if (!(e.target as HTMLElement).classList.contains("react-flow__pane")) return;
    addStateAt(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }

  const patchNodeData = useCallback(
    (id: string, patch: Partial<FlowNodeData>) => {
      setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes],
  );

  function patchEdge(id: string, patch: Partial<FlowEdgeData>) {
    setEdges((es) =>
      es.map((e) =>
        e.id === id
          ? {
              ...e,
              data: { ...e.data, ...patch } as FlowEdgeData,
              label: patch.action ?? e.data?.action ?? e.label,
            }
          : e,
      ),
    );
  }

  const setStart = useCallback(
    (id: string) => {
      setMeta((m) => ({ ...m, start: id }));
      setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, isStart: n.id === id } })));
    },
    [setNodes],
  );

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
    () => ({ renamingNodeId, commitRename, cancelRename }),
    [renamingNodeId, commitRename, cancelRename],
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
    setNodes((ns) => tidyLayout(ns, edges));
    window.requestAnimationFrame(() => fitView({ duration: 300, padding: 0.2 }));
  }

  function onValidate() {
    const errors = validateGraph(fromFlow(meta, nodes, edges));
    if (errors.length === 0) {
      message.success("Workflow graph is valid");
    } else {
      message.error(errors.map((e) => e.message).join(" • "));
    }
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
        <Space>
          <Button onClick={addState}>Add state</Button>
          <Button onClick={onTidy}>Tidy</Button>
          <Button onClick={onValidate}>Validate</Button>
          <Button type="primary" disabled={!dirty} onClick={save}>
            Save
          </Button>
        </Space>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: pane double-click is a canvas affordance. */}
        <div style={{ flex: 1, minWidth: 0 }} onDoubleClick={onPaneDoubleClick}>
          <NodeViewContext.Provider value={nodeViewCtx}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionMode={ConnectionMode.Loose}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onBeforeDelete={onBeforeDelete}
              onNodesDelete={onNodesDelete}
              onEdgesDelete={onEdgesDelete}
              onNodeClick={(_, n) => {
                setSelectedNodeId(n.id);
                setSelectedEdgeId(null);
              }}
              onNodeDoubleClick={(_, n) => setRenamingNodeId(n.id)}
              onEdgeClick={(_, e) => {
                setSelectedEdgeId(e.id);
                setSelectedNodeId(null);
              }}
              onPaneClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
              }}
              fitView
            >
              <Background />
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
              onChange={(patch) => patchNodeData(selectedNode.id, patch)}
              onSetStart={() => setStart(selectedNode.id)}
              onEditForm={onEditForm}
              onDelete={() => deleteElements({ nodes: [{ id: selectedNode.id }] })}
            />
          ) : selectedEdge ? (
            <EdgePanel
              edge={selectedEdge}
              onChange={(patch) => patchEdge(selectedEdge.id, patch)}
              onDelete={() => deleteElements({ edges: [{ id: selectedEdge.id }] })}
            />
          ) : (
            <Typography.Paragraph type="secondary">
              Select a state or transition to edit it. Drag from any handle to another node to
              create a transition. Double-click the canvas to add a state, or a node to rename it.
              Press Delete/Backspace to remove the selection.
            </Typography.Paragraph>
          )}
        </aside>
      </div>
    </div>
  );
}

function NodePanel({
  node,
  isStart,
  formOptions,
  onChange,
  onSetStart,
  onEditForm,
  onDelete,
}: {
  node: FlowNode;
  isStart: boolean;
  formOptions: WorkflowFormOption[];
  onChange: (patch: Partial<FlowNodeData>) => void;
  onSetStart: () => void;
  onEditForm?: (formId: string) => void;
  onDelete: () => void;
}) {
  const boundFormId = node.data.formId;
  // A bound form that no longer exists in the project still shows as a (dangling) option.
  const options = formOptions.map((f) => ({ value: f.id, label: f.title }));
  if (boundFormId && !formOptions.some((f) => f.id === boundFormId)) {
    options.push({ value: boundFormId, label: `${boundFormId} (missing)` });
  }
  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Typography.Title level={5} style={{ margin: 0 }}>
        State
      </Typography.Title>
      <Field label="Status">
        <Input value={node.data.status} onChange={(e) => onChange({ status: e.target.value })} />
      </Field>
      <Field label="Bound form">
        <Select
          style={{ width: "100%" }}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Select a form in this project"
          value={boundFormId}
          options={options}
          onChange={(value) => onChange({ formId: value || undefined })}
          notFoundContent="No forms in this project"
        />
      </Field>
      <Button block disabled={isStart} onClick={onSetStart}>
        {isStart ? "This is the start state" : "Set as start"}
      </Button>
      <Button
        block
        type="primary"
        disabled={!boundFormId || !onEditForm}
        onClick={() => boundFormId && onEditForm?.(boundFormId)}
      >
        Edit form
      </Button>
      <Button block danger disabled={isStart} onClick={onDelete}>
        Delete state
      </Button>
    </Space>
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
