import { CheckOutlined, SwapOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { Dropdown, Tooltip } from "antd";
import { useNavigate } from "react-router-dom";
import { getActiveTenantId, setActiveTenantId } from "../lib/activeTenant";
import { useMyTenants } from "../workspace";

/**
 * Workspace picker at the top of the {@link NavRail}. Selecting one stores the choice (which
 * `apiFetch` then sends as `X-Tenant-Id`) and invalidates every cached query, since projects,
 * permissions, org units and the admin catalog are all tenant-scoped. `invalidateQueries` rather than
 * `clear` keeps the session query warm so the app doesn't flash the login screen mid-switch.
 *
 * Renders nothing for users with a single workspace — the overwhelming case — so the rail stays as
 * it was before the switcher existed.
 */
export function TenantSwitcher() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { tenants } = useMyTenants();
  const activeId = getActiveTenantId();

  if (tenants.length <= 1) return null;

  const active = tenants.find((t) => t.id === activeId) ?? tenants[0];

  const onSelect = async (tenantId: string) => {
    if (tenantId === active.id) return;
    setActiveTenantId(tenantId);
    await qc.invalidateQueries();
    navigate("/projects");
  };

  return (
    <div style={{ padding: "8px 0", textAlign: "center" }}>
      <Dropdown
        trigger={["click"]}
        placement="bottomLeft"
        menu={{
          selectedKeys: [active.id],
          items: tenants.map((t) => ({
            key: t.id,
            label: t.personal ? `${t.name} (cá nhân)` : t.name,
            icon: t.id === active.id ? <CheckOutlined /> : undefined,
          })),
          onClick: ({ key }) => {
            void onSelect(key);
          },
        }}
      >
        <Tooltip title={`Không gian làm việc: ${active.name}`} placement="right">
          <button
            type="button"
            aria-label={`Đổi không gian làm việc (đang ở ${active.name})`}
            style={{
              width: 40,
              height: 40,
              border: "1px solid rgba(5, 5, 5, 0.15)",
              borderRadius: 8,
              background: "transparent",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
            }}
          >
            <SwapOutlined />
          </button>
        </Tooltip>
      </Dropdown>
    </div>
  );
}
