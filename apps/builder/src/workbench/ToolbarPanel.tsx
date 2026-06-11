import {
  DesktopOutlined,
  MobileOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  TabletOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { Button, Segmented, Space, Tooltip } from "antd";

/* ----------------------------------------------------------------------------
 * ToolbarPanel — the bar above the center ViewPanel (Designable's Toolbar). Owns
 * undo/redo, the device simulator (canvas/preview width), the view-mode switch
 * (Design / JSON / Preview) and a "play" shortcut that jumps to Preview. Pure
 * presentation — App owns every piece of state.
 * ------------------------------------------------------------------------- */

export type ViewMode = "design" | "json" | "preview";
export type Device = "Desktop" | "Tablet" | "Mobile";

export function ToolbarPanel({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  device,
  onDevice,
  viewMode,
  onViewMode,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  device: Device;
  onDevice: (device: Device) => void;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <Space>
        <Tooltip title="Undo">
          <Button aria-label="Undo" icon={<UndoOutlined />} disabled={!canUndo} onClick={onUndo} />
        </Tooltip>
        <Tooltip title="Redo">
          <Button aria-label="Redo" icon={<RedoOutlined />} disabled={!canRedo} onClick={onRedo} />
        </Tooltip>
      </Space>

      {/* The device simulator only constrains width in width-aware modes. */}
      <Segmented<Device>
        value={device}
        onChange={onDevice}
        disabled={viewMode === "json"}
        options={[
          { value: "Desktop", icon: <DesktopOutlined />, title: "Desktop" },
          { value: "Tablet", icon: <TabletOutlined />, title: "Tablet" },
          { value: "Mobile", icon: <MobileOutlined />, title: "Mobile" },
        ]}
      />

      <Space>
        <Segmented<ViewMode>
          value={viewMode}
          onChange={onViewMode}
          options={[
            { label: "Design", value: "design" },
            { label: "JSON", value: "json" },
            { label: "Preview", value: "preview" },
          ]}
        />
        <Tooltip title="Preview">
          <Button
            aria-label="Preview"
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => onViewMode("preview")}
          />
        </Tooltip>
      </Space>
    </div>
  );
}
