import { AppstoreOutlined, SettingOutlined } from "@ant-design/icons";
import { Menu, Tooltip } from "antd";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { UserMenu } from "../auth";
import { activeNavKey, visibleSections } from "./nav";

/** Icon per section key. Kept here (not in the pure `nav.ts`) so the catalog stays JSX-free. */
const SECTION_ICONS: Record<string, ReactNode> = {
  design: <AppstoreOutlined />,
};

/**
 * AppShell activity bar (§6.7) — a narrow icon rail on the far left, VS Code style. Renders the
 * enabled top-level sections; a Settings action + signed-in identity sit at the bottom. The rail is
 * always present behind `RequireAuth`, so it is the persistent frame every section renders into.
 */
export function NavRail() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = activeNavKey(pathname);
  const onSettings = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <div
      style={{
        width: 64,
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid rgba(5, 5, 5, 0.06)",
      }}
    >
      <Menu
        mode="inline"
        inlineCollapsed
        selectedKeys={active ? [active] : []}
        style={{ borderInlineEnd: "none" }}
        onClick={({ key }) => {
          const section = visibleSections().find((s) => s.key === key);
          if (section) navigate(section.path);
        }}
        items={visibleSections().map((s) => ({
          key: s.key,
          icon: SECTION_ICONS[s.key],
          label: s.label,
        }))}
      />
      <div style={{ marginTop: "auto", padding: "8px 0", textAlign: "center" }}>
        <Tooltip title="Cài đặt" placement="right">
          <SettingOutlined
            role="button"
            aria-label="Cài đặt"
            onClick={() => navigate("/settings")}
            style={{
              fontSize: 18,
              padding: 12,
              cursor: "pointer",
              color: onSettings ? "#1677ff" : undefined,
            }}
          />
        </Tooltip>
        <div style={{ padding: "8px 0" }}>
          <UserMenu compact />
        </div>
      </div>
    </div>
  );
}
