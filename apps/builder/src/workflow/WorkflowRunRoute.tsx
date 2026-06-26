import { FormRenderer, type FormRendererHandle } from "@org/form-renderer-web";
import type { WorkflowDefinition } from "@org/workflow-schema";
import { Alert, Button, Card, Empty, message, Space, Spin, Tag, Timeline, Typography } from "antd";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { runActions } from "./run-actions";
import { indexStatusCatalog, resolveStatusStyle, useStatusCatalog } from "./status-catalog";
import { useFormDefinition } from "./useFormDefinition";
import {
  useAdvanceInstance,
  useStartInstance,
  useWorkflowInstance,
  useWorkflowInstances,
} from "./useWorkflowInstances";
import { useWorkflow } from "./useWorkflows";

const { Title, Text } = Typography;

/**
 * Workflow Run view (WF3b) — operates a workflow at runtime, the counterpart to the editor. Two
 * modes share one route: with no `instanceId` it launches/lists cases; with one it renders the case.
 *
 * The case view renders the bound form (real, interactive {@link FormRenderer}) seeded with the
 * instance data at the current state, and one button per available action ({@link runActions}). The
 * server is authoritative: firing an action POSTs `{action, data}` and the engine (guards + roles)
 * decides the next state — a denial surfaces as the 422 message. History renders as a timeline.
 */
export function WorkflowRunRoute() {
  const { projectId, workflowId, instanceId } = useParams<{
    projectId: string;
    workflowId: string;
    instanceId?: string;
  }>();
  const { workflow: def, loading, error } = useWorkflow(workflowId);

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <Spin />
      </div>
    );
  }
  if (error || !def) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" showIcon message="Không tải được workflow" description={error ?? ""} />
      </div>
    );
  }

  return instanceId ? (
    <CaseRunner
      key={instanceId}
      def={def}
      projectId={projectId}
      workflowId={workflowId as string}
      instanceId={instanceId}
    />
  ) : (
    <CaseLauncher def={def} projectId={projectId} workflowId={workflowId as string} />
  );
}

/** Mode A — start a new case or pick an existing one. */
function CaseLauncher({
  def,
  projectId,
  workflowId,
}: {
  def: WorkflowDefinition;
  projectId: string | undefined;
  workflowId: string;
}) {
  const navigate = useNavigate();
  const { instances, loading } = useWorkflowInstances(workflowId);
  const start = useStartInstance(workflowId);
  const { entries } = useStatusCatalog(projectId);
  const byCode = useMemo(() => indexStatusCatalog(entries), [entries]);
  const [starting, setStarting] = useState(false);

  const labelOf = (stateId: string): string => {
    const node = def.nodes.find((n) => n.id === stateId);
    return node ? resolveStatusStyle(node, byCode).label : stateId;
  };

  const onStart = async () => {
    setStarting(true);
    try {
      const inst = await start();
      navigate(`/projects/${projectId}/workflows/${workflowId}/run/${inst.id}`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Space style={{ justifyContent: "space-between", width: "100%" }}>
          <Title level={3} style={{ margin: 0 }}>
            {def.title}
          </Title>
          <Button type="primary" loading={starting} onClick={onStart}>
            Bắt đầu case mới
          </Button>
        </Space>

        <Card title="Các case đang chạy" size="small">
          {loading ? (
            <Spin />
          ) : instances.length === 0 ? (
            <Empty description="Chưa có case nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Space direction="vertical" style={{ width: "100%" }}>
              {instances.map((inst) => (
                <Button
                  key={inst.id}
                  block
                  style={{ textAlign: "left", height: "auto", padding: "8px 12px" }}
                  onClick={() =>
                    navigate(`/projects/${projectId}/workflows/${workflowId}/run/${inst.id}`)
                  }
                >
                  <Space style={{ justifyContent: "space-between", width: "100%" }}>
                    <span>
                      <Tag>{labelOf(inst.current)}</Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {inst.id}
                      </Text>
                    </span>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(inst.updatedAt).toLocaleString()}
                    </Text>
                  </Space>
                </Button>
              ))}
            </Space>
          )}
        </Card>
      </Space>
    </div>
  );
}

/** Mode B — operate one running case: render the bound form, fire actions, show history. */
function CaseRunner({
  def,
  projectId,
  workflowId,
  instanceId,
}: {
  def: WorkflowDefinition;
  projectId: string | undefined;
  workflowId: string;
  instanceId: string;
}) {
  const navigate = useNavigate();
  const { instance, loading, error } = useWorkflowInstance(instanceId);
  const advance = useAdvanceInstance(instanceId, workflowId);
  const { entries } = useStatusCatalog(projectId);
  const byCode = useMemo(() => indexStatusCatalog(entries), [entries]);

  const node = instance ? def.nodes.find((n) => n.id === instance.current) : undefined;
  const { definition: form, loading: formLoading } = useFormDefinition(node?.formId);

  const formRef = useRef<FormRendererHandle>(null);
  const pendingAction = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fire = async (action: string, data: Record<string, unknown>) => {
    setBusy(true);
    try {
      await advance({ action, data });
      message.success(`Đã thực hiện "${action}"`);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onAction = (action: string) => {
    if (node?.formId) {
      // Validate the bound form first; its onSubmit fires the pending action with clean values.
      pendingAction.current = action;
      formRef.current?.submit();
    } else {
      void fire(action, {});
    }
  };

  const onSubmit = (values: Record<string, unknown>) => {
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) void fire(action, values);
  };

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <Spin />
      </div>
    );
  }
  if (error || !instance) {
    return (
      <div style={{ padding: 24 }}>
        <Alert type="error" showIcon message="Không tải được case" description={error ?? ""} />
      </div>
    );
  }

  const style = node ? resolveStatusStyle(node, byCode) : null;
  const actions = runActions(def, instance.current);
  const back = () => navigate(`/projects/${projectId}/workflows/${workflowId}/run`);

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Space style={{ justifyContent: "space-between", width: "100%" }}>
          <Space>
            <Button onClick={back}>← Danh sách case</Button>
            <Title level={4} style={{ margin: 0 }}>
              {def.title}
            </Title>
          </Space>
          {style ? <Tag color={style.color}>{style.label}</Tag> : <Tag>{instance.current}</Tag>}
        </Space>

        <Card size="small">
          {node?.formId ? (
            formLoading ? (
              <Spin />
            ) : form ? (
              <FormRenderer
                ref={formRef}
                schema={form}
                initialValues={instance.data}
                hideSubmit
                onSubmit={onSubmit}
              />
            ) : (
              <Alert type="warning" showIcon message="Form gắn với trạng thái này không tải được" />
            )
          ) : (
            <Text type="secondary">Trạng thái này không gắn form.</Text>
          )}
        </Card>

        <Space wrap>
          {actions.length === 0 ? (
            <Tag color="default">Trạng thái kết thúc — không còn hành động</Tag>
          ) : (
            actions.map((action) => (
              <Button key={action} type="primary" loading={busy} onClick={() => onAction(action)}>
                {action}
              </Button>
            ))
          )}
        </Space>

        <Card title="Lịch sử" size="small">
          {instance.history.length === 0 ? (
            <Empty description="Chưa có bước nào" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Timeline
              items={instance.history.map((h, i) => ({
                key: `${h.at}-${i}`,
                children: (
                  <span>
                    <Text strong>{h.action}</Text>: {h.from} → {h.to}{" "}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(h.at).toLocaleString()}
                    </Text>
                  </span>
                ),
              }))}
            />
          )}
        </Card>
      </Space>
    </div>
  );
}
