import { MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";

export interface ExplorerToggleProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

/** Fold/unfold control for the workspace explorer rail — lives in the editor header. */
export function ExplorerToggle({
  collapsed,
  onCollapsedChange,
}: ExplorerToggleProps) {
  return (
    <Tooltip title={collapsed ? "Hiện explorer" : "Ẩn explorer"}>
      <Button
        // size="small"
        // type="text"
        icon={
          collapsed ? (
            <MenuUnfoldOutlined style={{ fontSize: 16 }} />
          ) : (
            <MenuFoldOutlined style={{ fontSize: 16 }} />
          )
        }
        onClick={() => onCollapsedChange(!collapsed)}
      />
    </Tooltip>
  );
}
