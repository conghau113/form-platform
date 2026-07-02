import { Result, Spin, Tabs, Typography } from "antd";
import { hasFunction, useAuth } from "../auth";
import { RolesPanel } from "./RolesPanel";
import { UsersPanel } from "./UsersPanel";
import { useRbacRoles } from "./useAdmin";

/**
 * Admin section (§6.7 "Quản trị", product-roadmap Phase D1): tenant user & role management.
 * Tabs appear per function — `user.admin` for members, `role.admin` for roles (the `*` wildcard
 * grants both). Reaching this route without either (deep link) shows a 403 — matching the
 * server, which rejects the underlying calls regardless of what the client renders.
 */
export function AdminPage() {
  const { functions, functionsLoading } = useAuth();
  const canUsers = hasFunction(functions, "user.admin");
  const canRoles = hasFunction(functions, "role.admin");

  // Both tabs want the roles list (names for the assign picker; rows for the roles table). The
  // server accepts either admin function for reading roles (any-of gate).
  const { roles, loading: rolesLoading } = useRbacRoles(canUsers || canRoles);

  if (functionsLoading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <Spin />
      </div>
    );
  }

  if (!canUsers && !canRoles) {
    return (
      <Result
        status="403"
        title="Không có quyền truy cập"
        subTitle="Bạn cần quyền quản trị người dùng hoặc vai trò để xem trang này."
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
