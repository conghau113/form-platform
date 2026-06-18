import { validateGraph } from "@org/workflow-core";
import { migrateWorkflow } from "@org/workflow-schema";
import {
  addEdge,
  Background,
  type Connection,
  Controls,
  Handle,
  type NodeProps,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { Alert, Button, Divider, Input, message, Space, Tag, Typography } from "antd";
import { useCallback, useMemo, useState } from "react";
import workflowExample from "../../../../examples/workflow.v1.json";
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

/** Custom state node: shows its status, the bound formId, and a "start" badge. */
function WorkflowNodeView({ data, selected }: NodeProps<FlowNode>) {
  return (
    <div
      style={{
        minWidth: 140,
        padding: "8px 12px",
        borderRadius: 8,
        border: `2px solid ${selected ? "#1677ff" : "#d9d9d9"}`,
        background: "#fff",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Typography.Text strong>{data.status || "(unnamed)"}</Typography.Text>
        {data.isStart && <Tag color="green">start</Tag>}
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {data.formId ? `form: ${data.formId}` : "no form bound"}
      </Typography.Text>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { workflow: WorkflowNodeView };

export interface WorkflowEditorProps {
  /** Open the form builder bound to a node's formId (sets form mode + loads it). */
  onEditForm: (formId: string) => void;
}

export function WorkflowEditor({ onEditForm }: WorkflowEditorProps) {
  const seed = useMemo(() => toFlow(migrateWorkflow(workflowExample)), []);
  const [meta, setMeta] = useState<WorkflowMeta>(seed.meta);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(seed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(seed.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      setEdges((eds) => addEdge(newEdge(c.source!, c.target!, "next"), eds));
    },
    [setEdges],
  );

  function addState() {
    const node = newNode(`state${nodes.length + 1}`, { x: 80, y: 40 + nodes.length * 90 });
    setNodes((ns) => [...ns, node]);
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }

  function patchNodeData(id: string, patch: Partial<FlowNodeData>) {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }

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

  function setStart(id: string) {
    setMeta((m) => ({ ...m, start: id }));
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, isStart: n.id === id } })));
  }

  function onValidate() {
    const errors = validateGraph(fromFlow(meta, nodes, edges));
    if (errors.length === 0) {
      message.success("Workflow graph is valid");
    } else {
      message.error(errors.map((e) => e.message).join(" • "));
    }
  }

  function onExport() {
    const def = fromFlow(meta, nodes, edges);
    const blob = new Blob([JSON.stringify(def, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${meta.id || "workflow"}.workflow.json`;
    a.click();
    URL.revokeObjectURL(url);
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
          style={{ width: 200 }}
        />
        <Input
          value={meta.id}
          onChange={(e) => setMeta((m) => ({ ...m, id: e.target.value }))}
          placeholder="workflow id"
          style={{ width: 160 }}
        />
        <Space>
          <Button onClick={addState}>Add state</Button>
          <Button onClick={onValidate}>Validate</Button>
          <Button type="primary" onClick={onExport}>
            Export JSON
          </Button>
        </Space>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => {
              setSelectedNodeId(n.id);
              setSelectedEdgeId(null);
            }}
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
              onChange={(patch) => patchNodeData(selectedNode.id, patch)}
              onSetStart={() => setStart(selectedNode.id)}
              onEditForm={onEditForm}
            />
          ) : selectedEdge ? (
            <EdgePanel
              edge={selectedEdge}
              onChange={(patch) => patchEdge(selectedEdge.id, patch)}
            />
          ) : (
            <Typography.Paragraph type="secondary">
              Select a state or transition to edit it. Drag from a node's right handle to another
              node's left handle to create a transition.
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
  onChange,
  onSetStart,
  onEditForm,
}: {
  node: FlowNode;
  isStart: boolean;
  onChange: (patch: Partial<FlowNodeData>) => void;
  onSetStart: () => void;
  onEditForm: (formId: string) => void;
}) {
  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Typography.Title level={5} style={{ margin: 0 }}>
        State
      </Typography.Title>
      <Field label="Status">
        <Input value={node.data.status} onChange={(e) => onChange({ status: e.target.value })} />
      </Field>
      <Field label="Bound form id">
        <Input
          value={node.data.formId ?? ""}
          placeholder="form id"
          onChange={(e) => onChange({ formId: e.target.value || undefined })}
        />
      </Field>
      <Button block disabled={isStart} onClick={onSetStart}>
        {isStart ? "This is the start state" : "Set as start"}
      </Button>
      <Button
        block
        type="primary"
        disabled={!node.data.formId}
        onClick={() => node.data.formId && onEditForm(node.data.formId)}
      >
        Edit form
      </Button>
    </Space>
  );
}

function EdgePanel({
  edge,
  onChange,
}: {
  edge: FlowEdge;
  onChange: (patch: Partial<FlowEdgeData>) => void;
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
