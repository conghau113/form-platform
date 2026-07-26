import { DisconnectOutlined, LinkOutlined, WarningOutlined } from "@ant-design/icons";
import type { FieldNode, Preset } from "@org/form-schema";
import { Button, Select, Space, Tag, Tooltip, Typography } from "antd";
import { linkPatch, UNLINK_PATCH } from "../presets/link";

/**
 * PresetLink — the field-level "linked preset" control at the top of the leaf editor (Track W4).
 *
 * Picking a preset links the field to it (adopting its props; later edits become overrides);
 * clearing or pressing unlink detaches it (keeping the current props as a plain field). When the
 * linked preset is gone or its type no longer matches, the field is *stale*: it renders from its
 * own snapshot and we warn here. Only rendered when a preset of this field's type exists or the
 * field is already linked, so type families without presets stay uncluttered.
 */
export function PresetLink({
  field,
  presets,
  set,
}: {
  field: FieldNode;
  presets: Preset[];
  /** Commit a patch onto the field (same `set` the PropertyPanel hands to the editors). */
  set: (patch: Record<string, unknown>) => void;
}) {
  const presetId = (field as { presetId?: string }).presetId;
  const options = presets.filter((p) => p.fieldType === field.type);
  const found = presetId ? presets.find((p) => p.id === presetId) : undefined;
  // A link is healthy only when the preset still exists AND seeds this field's type.
  const linked = found && found.fieldType === field.type ? found : undefined;
  const stale = Boolean(presetId) && !linked;

  if (options.length === 0 && !presetId) return null;

  const onChange = (value: string | undefined) => {
    if (!value) return set(UNLINK_PATCH);
    const preset = presets.find((p) => p.id === value);
    if (preset) set(linkPatch(preset));
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <Typography.Text
        type="secondary"
        style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}
      >
        Linked preset
      </Typography.Text>
      <Space.Compact style={{ display: "flex", marginTop: 4 }}>
        <Select
          size="small"
          style={{ flex: 1 }}
          placeholder="Không liên kết"
          allowClear
          value={linked ? presetId : undefined}
          onChange={onChange}
          options={options.map((p) => ({ value: p.id, label: p.name }))}
          status={stale ? "warning" : undefined}
          suffixIcon={<LinkOutlined />}
        />
        {presetId && (
          <Tooltip title="Gỡ liên kết (giữ lại thuộc tính hiện tại)">
            <Button
              size="small"
              icon={<DisconnectOutlined />}
              aria-label="Gỡ liên kết preset"
              onClick={() => set(UNLINK_PATCH)}
            />
          </Tooltip>
        )}
      </Space.Compact>
      {stale && (
        <Tag icon={<WarningOutlined />} color="warning" style={{ marginTop: 6 }}>
          Preset “{presetId}” không khả dụng — đang dùng bản chụp
        </Tag>
      )}
      {linked && (
        <Typography.Paragraph type="secondary" style={{ fontSize: 11, margin: "6px 0 0" }}>
          Sửa preset sẽ tự cập nhật field này; chỉnh tại đây lưu thành override.
        </Typography.Paragraph>
      )}
    </div>
  );
}
