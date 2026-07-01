import { LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { Avatar, Dropdown, message, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";

/** Signed-in identity + sign-out (production-hardening 2B). Renders nothing when anonymous. */
export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: [
          { key: "email", label: user.email, disabled: true },
          { type: "divider" },
          { key: "logout", icon: <LogoutOutlined />, label: "Sign out" },
        ],
        onClick: async ({ key }) => {
          if (key !== "logout") return;
          try {
            await logout();
          } catch (e) {
            message.error((e as Error).message);
          }
          navigate("/login", { replace: true });
        },
      }}
    >
      <span
        style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}
        title="Account"
      >
        <Avatar size="small" icon={<UserOutlined />} />
        <Typography.Text>{user.displayName || user.email}</Typography.Text>
      </span>
    </Dropdown>
  );
}
