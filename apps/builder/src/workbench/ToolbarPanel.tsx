import {
  DesktopOutlined,
  MobileOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  TabletOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { Button, Segmented, Select, Space, Tooltip } from "antd";

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
  locales = [],
  locale,
  onLocale,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  device: Device;
  onDevice: (device: Device) => void;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  /** Locales the form can render in (default + extras); empty ⇒ no language switcher (i18n P2). */
  locales?: string[];
  /** The active preview locale; `undefined` ⇒ the authored default. */
  locale?: string;
  onLocale?: (locale: string | undefined) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
        justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <Space>
        <Tooltip title="Hoàn tác">
          <Button
            aria-label="Hoàn tác"
            icon={<UndoOutlined />}
            disabled={!canUndo}
            onClick={onUndo}
          />
        </Tooltip>
        <Tooltip title="Làm lại">
          <Button
            aria-label="Làm lại"
            icon={<RedoOutlined />}
            disabled={!canRedo}
            onClick={onRedo}
          />
        </Tooltip>
      </Space>

      {/* The device simulator only constrains width in width-aware modes. */}
      <Segmented<Device>
        value={device}
        onChange={onDevice}
        disabled={viewMode === "json"}
        options={[
          { value: "Desktop", icon: <DesktopOutlined />, title: "Máy tính" },
          { value: "Tablet", icon: <TabletOutlined />, title: "Máy tính bảng" },
          { value: "Mobile", icon: <MobileOutlined />, title: "Điện thoại" },
        ]}
      />

      <Space>
        {/* Language switcher — only when the form configures locales (i18n P2). The default
            locale (clearable) renders the authored strings; picking another localizes live. */}
        {locales.length > 0 && (
          <Select<string>
            allowClear
            size="small"
            style={{ width: 120 }}
            placeholder="Ngôn ngữ"
            value={locale}
            onChange={(v) => onLocale?.(v)}
            options={locales.map((l) => ({ label: l, value: l }))}
          />
        )}
        <Segmented<ViewMode>
          value={viewMode}
          onChange={onViewMode}
          options={[
            { label: "Thiết kế", value: "design" },
            { label: "JSON", value: "json" },
            { label: "Xem trước", value: "preview" },
          ]}
        />
        <Tooltip title="Xem trước">
          <Button
            aria-label="Xem trước"
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => onViewMode("preview")}
          />
        </Tooltip>
      </Space>
    </div>
  );
}
