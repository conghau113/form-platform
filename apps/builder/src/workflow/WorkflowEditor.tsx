import { FormRenderer } from "@org/form-renderer-web";
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
import {
  Alert,
  Button,
  Divider,
  Drawer,
  Empty,
  Input,
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
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { App } from "../App";
import { saveForm } from "../workspace/client";
import { newForm } from "../workspace/newForm";
import { FloatingEdge } from "./floating-edge";
import { tidyLayout } from "./layout";
import { useFormDefinition } from "./useFormDefinition";
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

  // --- Inline form integration (WF2b) ---------------------------------------
  // Editing/creating a node's bound form happens in a Drawer over the canvas (the full `App`
  // builder) — never navigating away from the workflow.
  const [editingFormId, setEditingFormId] = useState<string | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [creating, setCreating] = useState(false);
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
              zoomOnDoubleClick={false}
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
          ) : (
            <Typography.Paragraph type="secondary">
              Select a state or transition to edit it. Drag from any handle to another node to
              create a transition. Double-click the canvas to add a state, or a node to rename it.
              Press Delete/Backspace to remove the selection.
            </Typography.Paragraph>
          )}
        </aside>
      </div>

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
