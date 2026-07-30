import type { StatusKind } from "@org/workflow-schema";
import { Button, DatePicker, Select, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import { KIND_COLOR } from "../workflow/status-catalog";
import type { AssigneeOption, WorkOrderRow } from "./client";
import { isOverdue, PRIORITY_OPTIONS } from "./priority";
import { applySort, type WorkOrderQueryState } from "./work-order-query";

const { Text } = Typography;

/** Tag colour for a denormalized status kind; an unset kind (pre-Phase-E row) stays neutral. */
function statusColor(kind: string | null): string | undefined {
  return kind && kind in KIND_COLOR ? KIND_COLOR[kind as StatusKind] : undefined;
}

/**
 * The picker's options for one row. The current assignee is added when they are not in the member
 * list (they left the workspace since) so the cell shows the server's `assigneeName` rather than
 * falling back to a raw user id — reassigning them away is exactly what this cell is for.
 */
function assigneeOptions(
  assignees: AssigneeOption[],
  row: WorkOrderRow,
): { value: string; label: string }[] {
  const options = assignees.map((a) => ({ value: a.id, label: a.displayName || a.email }));
  if (row.assigneeId && !assignees.some((a) => a.id === row.assigneeId)) {
    options.unshift({
      value: row.assigneeId,
      label: row.assigneeName ?? "Không còn trong workspace",
    });
  }
  return options;
}

/**
 * The work-order list (Phase E). Paging and sorting are SERVER-side: the table is fully controlled
 * by {@link WorkOrderQueryState}, `pagination.total` comes from the server, and `onChange` maps the
 * user's intent back into the query rather than reordering rows locally.
 *
 * The assignee cell is an inline picker, disabled on rows the server told us this caller cannot
 * operate (`canRun`) — better a disabled control than a 403 after the click.
 */
export function WorkOrderTable({
  rows,
  total,
  state,
  loading,
  assignees,
  onState,
  onAssign,
  onUpdate,
}: {
  rows: WorkOrderRow[];
  total: number;
  state: WorkOrderQueryState;
  loading: boolean;
  assignees: AssigneeOption[];
  onState: (next: WorkOrderQueryState) => void;
  onAssign: (row: WorkOrderRow, assigneeId: string | null) => void;
  onUpdate: (row: WorkOrderRow, patch: { dueAt?: string | null; priority?: number }) => void;
}) {
  const navigate = useNavigate();
  const sortOrder = (field: string) =>
    state.sort === field ? (state.dir === "asc" ? "ascend" : "descend") : null;

  const columns: ColumnsType<WorkOrderRow> = [
    {
      title: "Việc",
      dataIndex: "label",
      render: (label: string | null) =>
        label ?? (
          <Text type="secondary" italic>
            Chưa có nhãn
          </Text>
        ),
      ellipsis: true,
    },
    { title: "Quy trình", dataIndex: "workflowTitle", ellipsis: true },
    {
      title: "Trạng thái",
      dataIndex: "current",
      sorter: true,
      sortOrder: sortOrder("current"),
      render: (current: string, row) => (
        <Tag color={statusColor(row.statusKind)}>{row.statusLabel ?? current}</Tag>
      ),
    },
    {
      title: "Người xử lý",
      dataIndex: "assigneeId",
      width: 200,
      render: (assigneeId: string | null, row) => (
        <Tooltip title={row.canRun ? undefined : "Bạn chỉ có quyền xem việc này"}>
          <Select
            allowClear
            size="small"
            style={{ width: "100%" }}
            placeholder="Chưa giao"
            disabled={!row.canRun}
            value={assigneeId ?? undefined}
            onChange={(next) => onAssign(row, next ?? null)}
            options={assigneeOptions(assignees, row)}
          />
        </Tooltip>
      ),
    },
    {
      title: "Ưu tiên",
      dataIndex: "priority",
      width: 130,
      sorter: true,
      // Urgency sorts numerically, so the default first click (ascend) would open with "Thấp" — the
      // opposite of what a queue is for. Most urgent first.
      sortDirections: ["descend", "ascend"],
      sortOrder: sortOrder("priority"),
      render: (priority: number, row) => (
        <Tooltip title={row.canRun ? undefined : "Bạn chỉ có quyền xem việc này"}>
          <Select
            size="small"
            style={{ width: "100%" }}
            disabled={!row.canRun}
            value={priority}
            onChange={(next) => onUpdate(row, { priority: next })}
            options={PRIORITY_OPTIONS}
          />
        </Tooltip>
      ),
    },
    {
      title: "Hạn xử lý",
      dataIndex: "dueAt",
      width: 165,
      sorter: true,
      sortOrder: sortOrder("dueAt"),
      render: (dueAt: string | null, row) => (
        <Tooltip title={row.canRun ? undefined : "Bạn chỉ có quyền xem việc này"}>
          <DatePicker
            size="small"
            style={{ width: "100%" }}
            disabled={!row.canRun}
            showTime={{ format: "HH:mm" }}
            format="DD/MM/YYYY HH:mm"
            placeholder="Chưa đặt"
            // Red only while it still matters: a finished case past its date is not "late".
            status={isOverdue(dueAt, row.statusKind) ? "error" : undefined}
            value={dueAt ? dayjs(dueAt) : null}
            // `toISOString()` is what the server demands — an instant WITH a timezone, so the same
            // deadline means the same moment wherever the api runs.
            onChange={(next) => onUpdate(row, { dueAt: next ? next.toISOString() : null })}
          />
        </Tooltip>
      ),
    },
    { title: "Dự án", dataIndex: "projectName", ellipsis: true },
    {
      title: "Cập nhật",
      dataIndex: "updatedAt",
      sorter: true,
      sortOrder: sortOrder("updatedAt"),
      width: 170,
      render: (at: string) => new Date(at).toLocaleString(),
    },
    {
      title: "",
      key: "open",
      width: 80,
      render: (_, row) => (
        <Button
          size="small"
          onClick={() =>
            navigate(`/projects/${row.projectId}/workflows/${row.workflowId}/run/${row.id}`)
          }
        >
          Mở
        </Button>
      ),
    },
  ];

  return (
    <Table<WorkOrderRow>
      rowKey="id"
      size="small"
      loading={loading}
      columns={columns}
      dataSource={rows}
      scroll={{ x: 1200 }}
      pagination={{
        current: state.page,
        pageSize: state.pageSize,
        total,
        showSizeChanger: true,
        showTotal: (t) => `${t} việc`,
      }}
      onChange={(pagination, _filters, sorter) => {
        const s = Array.isArray(sorter) ? sorter[0] : sorter;
        const sorted = applySort(state, s?.field, s?.order);
        const reordered = sorted.sort !== state.sort || sorted.dir !== state.dir;
        onState({
          ...sorted,
          // A new order makes the old page number meaningless — start from the top.
          page: reordered ? 1 : (pagination.current ?? 1),
          pageSize: pagination.pageSize ?? state.pageSize,
        });
      }}
    />
  );
}
