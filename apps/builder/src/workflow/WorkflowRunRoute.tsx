import { FormRenderer, type FormRendererHandle } from "@org/form-renderer-web";
import { deriveCaseLabel, localizeWorkflow } from "@org/workflow-core";
import type { WorkflowDefinition } from "@org/workflow-schema";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  DatePicker,
  Empty,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { hasFunction, useAuth } from "../auth";
// Submodule imports (not the barrel): the Run view wants the work-order hooks + the comment thread,
// not the whole Operate screen pulled into this chunk.
import { CaseComments } from "../operate/CaseComments";
import { CaseParticipants } from "../operate/CaseParticipants";
import {
  isOverdue,
  PRIORITY_COLOR,
  PRIORITY_NORMAL,
  PRIORITY_OPTIONS,
  priorityLabel,
} from "../operate/priority";
import { useCaseParticipants } from "../operate/useCaseParticipants";
import { useAssignCase, useAssignees, useUpdateWorkOrder } from "../operate/useWorkOrders";
import { CaseProgressCard } from "./CaseProgressCard";
import { actionLabel, isTerminalState, runActions } from "./run-actions";
import { workflowRoles } from "./run-roles";
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

/** The locales this workflow offers (authored default + declared extras), mirroring App.tsx's form
 *  language switcher. Empty ⇒ no switcher and no localization. */
function localeOptionsOf(def: WorkflowDefinition): string[] {
  const all = [...(def.defaultLocale ? [def.defaultLocale] : []), ...(def.locales ?? [])];
  return [...new Set(all)];
}

/** The Run view language switcher — only rendered when the workflow declares locales (WF4b). */
function LocaleSwitcher({
  options,
  locale,
  onLocale,
}: {
  options: string[];
  locale: string | undefined;
  onLocale: (locale: string | undefined) => void;
}) {
  if (options.length === 0) return null;
  return (
    <Space size="small">
      <Text type="secondary">Ngôn ngữ:</Text>
      <Select<string>
        allowClear
        size="small"
        style={{ width: 120 }}
        placeholder="Mặc định"
        value={locale}
        onChange={onLocale}
        options={options.map((l) => ({ label: l, value: l }))}
      />
    </Space>
  );
}

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
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const { instances, loading } = useWorkflowInstances(workflowId);
  const start = useStartInstance(workflowId);
  const { entries } = useStatusCatalog(projectId);
  const byCode = useMemo(() => indexStatusCatalog(entries), [entries]);
  const [starting, setStarting] = useState(false);

  // #3: a case is "done" when its current state is terminal (no outgoing transition). Default to the
  // running cases so a long-lived list isn't dominated by finished ones; offer Done / All as well.
  type Filter = "active" | "done" | "all";
  const [filter, setFilter] = useState<Filter>("active");
  const { active, done } = useMemo(() => {
    const a: typeof instances = [];
    const d: typeof instances = [];
    for (const inst of instances) {
      (isTerminalState(def, inst.current) ? d : a).push(inst);
    }
    return { active: a, done: d };
  }, [instances, def]);
  const visible = filter === "active" ? active : filter === "done" ? done : instances;

  // WF4b: localize state labels + title for display; switcher offers the declared locales.
  const localeOptions = useMemo(() => localeOptionsOf(def), [def]);
  const [locale, setLocale] = useState<string | undefined>(def.defaultLocale);
  const view = useMemo(
    () => (locale ? localizeWorkflow(def, locale, def.defaultLocale) : def),
    [def, locale],
  );

  const labelOf = (stateId: string): string => {
    const node = view.nodes.find((n) => n.id === stateId);
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
        <Space style={{ justifyContent: "space-between", width: "100%" }} wrap>
          <Title level={3} style={{ margin: 0 }}>
            {view.title}
          </Title>
          <Space wrap>
            <LocaleSwitcher options={localeOptions} locale={locale} onLocale={setLocale} />
            <Button type="primary" loading={starting} onClick={onStart}>
              Bắt đầu case mới
            </Button>
          </Space>
        </Space>

        <Card
          title="Các case"
          size="small"
          extra={
            instances.length > 0 ? (
              <Segmented<Filter>
                size="small"
                value={filter}
                onChange={setFilter}
                options={[
                  { label: `Đang chạy (${active.length})`, value: "active" },
                  { label: `Đã xong (${done.length})`, value: "done" },
                  { label: `Tất cả (${instances.length})`, value: "all" },
                ]}
              />
            ) : null
          }
        >
          {loading ? (
            <Spin />
          ) : visible.length === 0 ? (
            <Empty
              description={
                instances.length === 0
                  ? "Chưa có case nào"
                  : filter === "active"
                    ? "Không có case đang chạy"
                    : "Không có case đã xong"
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <Space direction="vertical" style={{ width: "100%" }}>
              {visible.map((inst) => (
                <Button
                  key={inst.id}
                  block
                  style={{ textAlign: "left", height: "auto", padding: "8px 12px" }}
                  onClick={() =>
                    navigate(`/projects/${projectId}/workflows/${workflowId}/run/${inst.id}`)
                  }
                >
                  <Space direction="vertical" size={2} style={{ width: "100%" }}>
                    <Space style={{ justifyContent: "space-between", width: "100%" }}>
                      <Text strong style={{ fontSize: 13 }}>
                        {inst.label ?? (
                          <Text type="secondary" italic style={{ fontSize: 13 }}>
                            Case chưa có nhãn
                          </Text>
                        )}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                        {new Date(inst.updatedAt).toLocaleString()}
                      </Text>
                    </Space>
                    <Space size="small">
                      <Tag style={{ margin: 0 }}>{labelOf(inst.current)}</Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {inst.id}
                      </Text>
                    </Space>
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
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const { instance, loading, error } = useWorkflowInstance(instanceId);
  const advance = useAdvanceInstance(instanceId, workflowId);
  const { entries } = useStatusCatalog(projectId);
  const byCode = useMemo(() => indexStatusCatalog(entries), [entries]);

  // Phase E: who the case belongs to. It lives on the case SUMMARY (org index), not in the engine
  // contract, so it comes from the workflow's case list — free when arriving from the launcher,
  // one extra summary fetch when deep-linked from the Vận hành table. Names resolve through the
  // work-order member list, which needs `workflow.run`; without it we show no name at all rather
  // than a raw user id.
  const { user, functions } = useAuth();
  const canSeeMembers = hasFunction(functions, "workflow.run");
  const { assignees, nameOf } = useAssignees(canSeeMembers);
  const { instances, loading: summaryLoading } = useWorkflowInstances(workflowId);
  const summary = instances.find((i) => i.id === instanceId);
  const assign = useAssignCase();
  const updateWorkOrder = useUpdateWorkOrder();
  const [assigning, setAssigning] = useState(false);

  const claim = async (assigneeId: string | null) => {
    setAssigning(true);
    try {
      await assign({ instanceId, assigneeId, workflowId });
      message.success(assigneeId ? "Bạn đã nhận việc này" : "Đã bỏ nhận việc");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setAssigning(false);
    }
  };

  const patchWorkOrder = async (patch: { dueAt?: string | null; priority?: number }) => {
    try {
      await updateWorkOrder({ instanceId, patch, workflowId });
      message.success("Đã cập nhật việc");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  // WF4b: a localized view for display (title/status/action labels + the bound form). Actions still
  // fire on the ORIGINAL `def` — `action` is the engine identifier, never the localized label.
  const localeOptions = useMemo(() => localeOptionsOf(def), [def]);
  const [locale, setLocale] = useState<string | undefined>(def.defaultLocale);
  const view = useMemo(
    () => (locale ? localizeWorkflow(def, locale, def.defaultLocale) : def),
    [def, locale],
  );

  const node = instance ? view.nodes.find((n) => n.id === instance.current) : undefined;
  const { definition: form, loading: formLoading } = useFormDefinition(node?.formId);

  // Phase E3a: the domain roles this workflow gates transitions on are now only SUGGESTIONS for the
  // cast picker. The roles the actor is actually judged by are the server's own (project role +
  // workspace roles + this case's cast), shown read-only in the participants panel.
  const roleOptions = useMemo(() => workflowRoles(def), [def]);

  // E3c: mask the bound form by the SERVER's own verdict on this actor. `FormRenderer` defaults to
  // `access: {roles: []}`, so until now the run view OVER-masked — a `viewRoles`-gated field was
  // hidden from everyone, including the very people E3a exists to give it to.
  //
  // It must be the per-CASE set (`myRoles` = project role + workspace roles + this case's cast +
  // `assignee`), not `forProject`: that is what the server masks `instance.data` with and what the
  // engine checks `transition.role` against. Free here — `<CaseParticipants>` below already fetches
  // the same query, and unlike project roles it is invalidated whenever the cast changes.
  const { cast, loading: rolesLoading } = useCaseParticipants(instanceId);

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
  const caseLabel = deriveCaseLabel(instance.data);
  const back = () => navigate(`/projects/${projectId}/workflows/${workflowId}/run`);

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Space style={{ justifyContent: "space-between", width: "100%" }} wrap>
          <Space>
            <Button onClick={back}>← Danh sách case</Button>
            <div>
              <Title level={4} style={{ margin: 0 }}>
                {caseLabel ?? view.title}
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {caseLabel ? view.title : instance.id}
              </Text>
            </div>
          </Space>
          <Space wrap>
            <LocaleSwitcher options={localeOptions} locale={locale} onLocale={setLocale} />
            {style ? <Tag color={style.color}>{style.label}</Tag> : <Tag>{instance.current}</Tag>}
          </Space>
        </Space>

        <Space size="small" wrap>
          <Text type="secondary">Người phụ trách:</Text>
          {summary?.assigneeId ? (
            <Tag color="blue">{nameOf(summary.assigneeId) ?? "Đã giao"}</Tag>
          ) : (
            <Tag>Chưa giao</Tag>
          )}
          {/* Claiming needs run access; `workflow.run` is the grant that confers it and the gate
              the whole work-order feature already stands behind, so a plain viewer sees the
              assignee but no button instead of a guaranteed 403 after the click. */}
          {user &&
            canSeeMembers &&
            (summary?.assigneeId === user.id ? (
              <Button size="small" loading={assigning} onClick={() => void claim(null)}>
                Bỏ nhận
              </Button>
            ) : (
              <Button size="small" loading={assigning} onClick={() => void claim(user.id)}>
                Nhận việc
              </Button>
            ))}
        </Space>

        {/* Phase E2: the same two work-order attributes the Vận hành table edits inline. Gated like
            the claim button above — and, like it, the tenant-level `workflow.run` is not the exact
            per-project verdict, so a scoped-away grant can still meet a 403 on save. */}
        <Space size="small" wrap>
          <Text type="secondary">Ưu tiên:</Text>
          {/* While the summary is still loading, `summary` is undefined — showing the defaults would
              state "Bình thường / Chưa đặt" as fact and then flip once the data lands. */}
          {summaryLoading ? (
            <Spin size="small" />
          ) : canSeeMembers ? (
            <Select
              size="small"
              style={{ width: 140 }}
              value={summary?.priority ?? PRIORITY_NORMAL}
              onChange={(priority) => void patchWorkOrder({ priority })}
              options={PRIORITY_OPTIONS}
            />
          ) : (
            <Tag color={PRIORITY_COLOR[summary?.priority ?? PRIORITY_NORMAL]}>
              {priorityLabel(summary?.priority ?? PRIORITY_NORMAL)}
            </Tag>
          )}
          <Text type="secondary">Hạn xử lý:</Text>
          {summaryLoading ? (
            <Spin size="small" />
          ) : canSeeMembers ? (
            <DatePicker
              size="small"
              showTime={{ format: "HH:mm" }}
              format="DD/MM/YYYY HH:mm"
              placeholder="Chưa đặt"
              status={
                isOverdue(summary?.dueAt ?? null, summary?.statusKind ?? null) ? "error" : undefined
              }
              value={summary?.dueAt ? dayjs(summary.dueAt) : null}
              onChange={(next) => void patchWorkOrder({ dueAt: next ? next.toISOString() : null })}
            />
          ) : summary?.dueAt ? (
            <Text type={isOverdue(summary.dueAt, summary.statusKind) ? "danger" : undefined}>
              {new Date(summary.dueAt).toLocaleString()}
            </Text>
          ) : (
            <Tag>Chưa đặt</Tag>
          )}
        </Space>

        <Card size="small">
          {node?.formId ? (
            formLoading || rolesLoading ? (
              <Spin />
            ) : form ? (
              <FormRenderer
                ref={formRef}
                schema={form}
                initialValues={instance.data}
                access={{ roles: cast.myRoles }}
                hideSubmit
                onSubmit={onSubmit}
                locale={locale}
                fallbackLocale={def.defaultLocale}
              />
            ) : (
              <Alert type="warning" showIcon message="Form gắn với trạng thái này không tải được" />
            )
          ) : (
            <Text type="secondary">Trạng thái này không gắn form.</Text>
          )}
        </Card>

        {/* Phase E3a. Reading the cast only needs `viewer`, so this renders for every case reader;
            only the controls are gated, matching the server. */}
        <Card size="small">
          <CaseParticipants
            instanceId={instanceId}
            canRun={canSeeMembers}
            roleOptions={roleOptions}
            nameOf={nameOf}
            members={assignees}
          />
        </Card>

        <Space wrap>
          {actions.length === 0 ? (
            <Tag color="default">Trạng thái kết thúc — không còn hành động</Tag>
          ) : (
            actions.map((action) => (
              <Button key={action} type="primary" loading={busy} onClick={() => onAction(action)}>
                {actionLabel(def, action, locale, def.defaultLocale)}
              </Button>
            ))
          )}
        </Space>

        <CaseProgressCard
          def={def}
          view={view}
          instance={instance}
          byCode={byCode}
          nameOf={nameOf}
          locale={locale}
        />

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
                      {/* Phase E: entries recorded before this (or by a user we can't name) simply
                          show no actor — never a raw user id. */}
                      {nameOf(h.actor) ? ` · ${nameOf(h.actor)}` : ""}
                    </Text>
                  </span>
                ),
              }))}
            />
          )}
        </Card>

        {/* Phase E2. Reading a thread only needs `viewer`, so this renders for every case reader;
            only the composer is gated, matching the server. */}
        <Card size="small">
          <CaseComments instanceId={instanceId} canWrite={canSeeMembers} />
        </Card>
      </Space>
    </div>
  );
}
