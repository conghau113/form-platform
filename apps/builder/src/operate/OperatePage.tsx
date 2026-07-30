import { Alert, App as AntApp, Button, Empty, Result, Space, Spin, Typography } from "antd";
import { useState } from "react";
import { hasFunction, useAuth } from "../auth";
import { getActiveTenantId } from "../lib/activeTenant";
// Submodule import (not the barrel): only the tenant hook is wanted here, not the whole workspace.
import { useMyTenants } from "../workspace/useWorkspace";
import type { WorkOrderRow } from "./client";
import { NewCaseModal } from "./NewCaseModal";
import {
  useAssignCase,
  useAssignees,
  useRunnableWorkflows,
  useUpdateWorkOrder,
  useWorkOrders,
} from "./useWorkOrders";
import { WorkOrderFilters } from "./WorkOrderFilters";
import { WorkOrderTable } from "./WorkOrderTable";
import { applyFilters, DEFAULT_WORK_ORDER_QUERY } from "./work-order-query";

/**
 * Operate section (§6.7 "Vận hành", product-roadmap Phase E) — the work-order manager: every case
 * in the ACTIVE workspace, filterable by workflow / status / assignee, with assignment in place.
 *
 * Gated on `workflow.run`, matching the server exactly; reaching the route without it (deep link)
 * shows a 403 instead of an empty screen. Unlike `/projects`, this screen always belongs to ONE
 * workspace — the assignee list and every assignment are workspace-scoped, so mixing in cases
 * shared from elsewhere would only offer choices the server must reject.
 */
export function OperatePage() {
  const { message } = AntApp.useApp();
  const { functions, functionsLoading } = useAuth();
  const canRun = hasFunction(functions, "workflow.run");

  const [state, setState] = useState(DEFAULT_WORK_ORDER_QUERY);
  const [creating, setCreating] = useState(false);
  const { page, loading, error } = useWorkOrders(state, canRun);
  const { assignees } = useAssignees(canRun);
  const { workflows } = useRunnableWorkflows(canRun);
  const { tenants } = useMyTenants();
  const assign = useAssignCase();
  const update = useUpdateWorkOrder();

  const onAssign = async (row: WorkOrderRow, assigneeId: string | null) => {
    try {
      await assign({ instanceId: row.id, assigneeId, workflowId: row.workflowId });
      message.success(assigneeId ? "Đã giao việc" : "Đã bỏ giao việc");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const onUpdate = async (
    row: WorkOrderRow,
    patch: { dueAt?: string | null; priority?: number },
  ) => {
    try {
      await update({ instanceId: row.id, patch, workflowId: row.workflowId });
      message.success("Đã cập nhật việc");
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  if (functionsLoading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <Spin />
      </div>
    );
  }

  if (!canRun) {
    return (
      <Result
        status="403"
        title="Không có quyền truy cập"
        subTitle="Bạn cần quyền chạy quy trình để xem trang này."
      />
    );
  }

  // The "you're in workspace X" hint only makes sense when the list is empty because of WHERE the
  // user is — with a filter applied the empty list is self-explanatory, and there must be another
  // workspace to switch to for the advice to mean anything.
  const activeId = getActiveTenantId();
  const filtered = Boolean(
    state.workflowId ||
      state.current ||
      state.statusKind ||
      state.assignee ||
      state.q ||
      state.priority ||
      state.overdue,
  );
  const activeTenant =
    tenants.length > 1 && !filtered
      ? (tenants.find((t) => t.id === activeId) ?? tenants[0])
      : undefined;

  return (
    // 1400, not 1200: the table needs ~1200px for its nine columns (Phase E2 added two), and a
    // container narrower than its own content would scroll horizontally at every viewport size.
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", width: "100%", overflow: "auto" }}>
      <Space style={{ justifyContent: "space-between", width: "100%", marginBottom: 16 }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Vận hành
        </Typography.Title>
        <Button type="primary" disabled={workflows.length === 0} onClick={() => setCreating(true)}>
          Tạo việc
        </Button>
      </Space>

      {error && (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} closable />
      )}

      <WorkOrderFilters
        state={state}
        onChange={(patch) => setState((s) => applyFilters(s, patch))}
        workflows={workflows}
        assignees={assignees}
      />

      {!loading && page.total === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Space direction="vertical" size={4}>
              <span>Không có việc nào</span>
              {activeTenant && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Bạn đang ở không gian làm việc "{activeTenant.name}" — đổi ở góc trên bên trái.
                </Typography.Text>
              )}
            </Space>
          }
        />
      ) : (
        <WorkOrderTable
          rows={page.rows}
          total={page.total}
          state={state}
          loading={loading}
          assignees={assignees}
          onState={setState}
          onAssign={(row, assigneeId) => void onAssign(row, assigneeId)}
          onUpdate={(row, patch) => void onUpdate(row, patch)}
        />
      )}

      <NewCaseModal
        open={creating}
        onClose={() => setCreating(false)}
        workflows={workflows}
        assignees={assignees}
      />
    </div>
  );
}
