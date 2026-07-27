import { Result, Spin, Tabs, Typography } from "antd";
import { hasFunction, useAuth } from "../auth";
import { FormsPanel, InstancesPanel, VersionsPanel, WorkflowsPanel } from "./CatalogPanels";
import { RolesPanel } from "./RolesPanel";
import { UsersPanel } from "./UsersPanel";
import { useRbacRoles } from "./useAdmin";

/**
 * Admin section (§6.7 "Quản trị", product-roadmap Phase D1 + D2–D4): tenant user & role management
 * plus the tenant-wide form / workflow / version / case catalog. Tabs appear per function —
 * `user.admin`, `role.admin`, `form.admin`, `workflow.admin` (the `*` wildcard grants all).
 * Reaching this route with none (deep link) shows a 403 — matching the server, which rejects the
 * underlying calls regardless of what the client renders.
 */
export function AdminPage() {
  const { functions, functionsLoading } = useAuth();
  const canUsers = hasFunction(functions, "user.admin");
  const canRoles = hasFunction(functions, "role.admin");
  const canForms = hasFunction(functions, "form.admin");
  const canWorkflows = hasFunction(functions, "workflow.admin");

  // Both RBAC tabs want the roles list (names for the assign picker; rows for the roles table). The
  // server accepts either admin function for reading roles (any-of gate).
  const { roles, loading: rolesLoading } = useRbacRoles(canUsers || canRoles);

  if (functionsLoading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <Spin />
      </div>
    );
  }

  if (!canUsers && !canRoles && !canForms && !canWorkflows) {
    return (
      <Result
        status="403"
        title="Không có quyền truy cập"
        subTitle="Bạn cần quyền quản trị để xem trang này."
      />
    );
  }

  const items = [
    canUsers && {
      key: "users",
      label: "Người dùng",
      children: <UsersPanel roles={roles} />,
    },
    canRoles && {
      key: "roles",
      label: "Vai trò",
      children: <RolesPanel roles={roles} loading={rolesLoading} />,
    },
    canForms && { key: "forms", label: "Biểu mẫu", children: <FormsPanel /> },
    canWorkflows && { key: "workflows", label: "Quy trình", children: <WorkflowsPanel /> },
    canForms && { key: "versions", label: "Phiên bản", children: <VersionsPanel /> },
    canWorkflows && { key: "instances", label: "Case đang chạy", children: <InstancesPanel /> },
  ].filter((x): x is Exclude<typeof x, false> => Boolean(x));

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto", width: "100%", overflow: "auto" }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Quản trị
      </Typography.Title>
      <Tabs items={items} />
    </div>
  );
}
