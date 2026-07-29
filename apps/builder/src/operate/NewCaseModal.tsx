import { FormRenderer, type FormRendererHandle } from "@org/form-renderer-web";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, App as AntApp, Modal, Select, Space, Spin, Typography } from "antd";
import { useRef, useState } from "react";
import { qk } from "../query";
import { useFormDefinition } from "../workflow/useFormDefinition";
import { useStartInstance } from "../workflow/useWorkflowInstances";
import { useWorkflow } from "../workflow/useWorkflows";
import type { AssigneeOption, RunnableWorkflow } from "./client";
import { useAssignCase } from "./useWorkOrders";

const { Text } = Typography;

/**
 * "Tạo việc" (Phase E) — start a case from the Vận hành screen instead of having to open the
 * workflow editor's Run view first.
 *
 * The start node's bound form is rendered with the real {@link FormRenderer}, so a case is born with
 * its data (and therefore its label) already filled in. The server still runs the engine; this only
 * chooses the workflow and the initial values. Assigning is optional and happens right after the
 * case exists — the id doesn't exist before that.
 */
export function NewCaseModal({
  open,
  onClose,
  workflows,
  assignees,
}: {
  open: boolean;
  onClose: () => void;
  workflows: RunnableWorkflow[];
  assignees: AssigneeOption[];
}) {
  const { message } = AntApp.useApp();
  const qc = useQueryClient();
  const [workflowId, setWorkflowId] = useState<string | undefined>();
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const { workflow, loading: defLoading } = useWorkflow(workflowId);
  const startNode = workflow?.nodes.find((n) => n.id === workflow.start);
  const { definition: form, loading: formLoading } = useFormDefinition(startNode?.formId);
  const startCase = useStartInstance(workflowId);
  const assign = useAssignCase();
  const formRef = useRef<FormRendererHandle>(null);

  const close = () => {
    setWorkflowId(undefined);
    setAssigneeId(undefined);
    onClose();
  };

  const create = async (data: Record<string, unknown>) => {
    if (!workflowId) return;
    setBusy(true);
    try {
      const instance = await startCase(data);
      // The case now EXISTS: show it and close, whatever happens next. Assignment is a separate
      // server call — letting its failure keep the modal open would invite a duplicate case.
      qc.invalidateQueries({ queryKey: qk.workOrderPages });
      message.success("Đã tạo việc mới");
      close();
      if (assigneeId) await assign({ instanceId: instance.id, assigneeId, workflowId });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Tạo việc mới"
      okText="Tạo"
      cancelText="Hủy"
      confirmLoading={busy}
      onCancel={close}
      // With a bound form we submit it first so its validation runs; its onSubmit creates the case.
      onOk={() => (startNode?.formId ? formRef.current?.submit() : void create({}))}
      // Disabled while the workflow or its bound form is still loading, and when that form failed
      // to load — `submit()` on a form that never rendered would be a silent no-op.
      okButtonProps={{
        disabled: !workflowId || defLoading || formLoading || (Boolean(startNode?.formId) && !form),
      }}
      destroyOnHidden
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Chọn quy trình"
          style={{ width: "100%" }}
          value={workflowId}
          onChange={setWorkflowId}
          options={workflows.map((w) => ({ value: w.id, label: w.title }))}
        />

        {workflowId &&
          (defLoading || formLoading ? (
            <Spin />
          ) : startNode?.formId ? (
            form ? (
              <FormRenderer ref={formRef} schema={form} hideSubmit onSubmit={create} />
            ) : (
              <Alert type="warning" showIcon message="Không tải được biểu mẫu của bước đầu tiên" />
            )
          ) : (
            <Text type="secondary">Bước đầu tiên không gắn biểu mẫu — việc sẽ được tạo trống.</Text>
          ))}

        <Select
          allowClear
          placeholder="Giao cho (tùy chọn)"
          style={{ width: "100%" }}
          value={assigneeId}
          onChange={setAssigneeId}
          options={assignees.map((a) => ({ value: a.id, label: a.displayName || a.email }))}
        />
      </Space>
    </Modal>
  );
}
