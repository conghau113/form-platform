import { Input, Select, Space } from "antd";
import { useWorkflow } from "../workflow/useWorkflows";
import type { AssigneeOption, RunnableWorkflow } from "./client";
import type { WorkOrderFilters as Filters, WorkOrderQueryState } from "./work-order-query";

/** Engine categories the server can filter on — mirrors `@IsIn(["start","normal","end"])` in the
 *  api's `list-work-orders.dto.ts`. There is no single "still open" value: a case is open unless its
 *  node is an end node, which is two of the three options. */
const STATUS_KINDS = [
  { value: "start", label: "Mới bắt đầu" },
  { value: "normal", label: "Đang xử lý" },
  { value: "end", label: "Đã xong" },
];

/**
 * The work-order list filters (Phase E). Every control narrows the SERVER query — nothing here
 * filters rows in the browser, so a filter always searches the whole workspace, not the open page.
 *
 * The node-status picker only appears once a workflow is chosen: a state id (`review`, `approved`)
 * only means something inside one workflow's graph.
 */
export function WorkOrderFilters({
  state,
  onChange,
  workflows,
  assignees,
}: {
  state: WorkOrderQueryState;
  onChange: (patch: Filters) => void;
  workflows: RunnableWorkflow[];
  assignees: AssigneeOption[];
}) {
  const { workflow } = useWorkflow(state.workflowId);
  const nodes = state.workflowId && workflow ? workflow.nodes : [];

  return (
    <Space wrap style={{ marginBottom: 16 }}>
      <Select
        allowClear
        placeholder="Quy trình"
        style={{ width: 200 }}
        value={state.workflowId}
        onChange={(workflowId) => onChange({ workflowId })}
        options={workflows.map((w) => ({ value: w.id, label: w.title }))}
      />
      <Select
        allowClear
        placeholder="Trạng thái"
        style={{ width: 180 }}
        disabled={nodes.length === 0}
        value={state.current}
        onChange={(current) => onChange({ current })}
        options={nodes.map((n) => ({ value: n.id, label: n.status }))}
      />
      <Select
        allowClear
        placeholder="Tình trạng"
        style={{ width: 160 }}
        value={state.statusKind}
        onChange={(statusKind) => onChange({ statusKind })}
        options={STATUS_KINDS}
      />
      <Select
        allowClear
        placeholder="Người xử lý"
        style={{ width: 220 }}
        value={state.assignee}
        onChange={(assignee) => onChange({ assignee })}
        options={[
          { value: "me", label: "Việc của tôi" },
          { value: "none", label: "Chưa giao" },
          ...assignees.map((a) => ({ value: a.id, label: a.displayName || a.email })),
        ]}
      />
      <Input.Search
        allowClear
        placeholder="Tìm theo nhãn việc"
        style={{ width: 220 }}
        // The api caps the term at 200 chars (`@MaxLength(200)`); stop before the 400 does.
        maxLength={200}
        defaultValue={state.q}
        // Search on submit, not per keystroke: each change is a server round-trip.
        onSearch={(q) => onChange({ q: q || undefined })}
      />
    </Space>
  );
}
