import type { Preset } from "@org/form-schema";
import {
  Alert,
  App as AntApp,
  Button,
  Checkbox,
  Empty,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import { useProjectTree } from "../workspace/useWorkspace";
import { useApplyPreset } from "./useApplyPreset";

export interface ApplyPresetModalProps {
  open: boolean;
  onClose: () => void;
  /** The preset to link into the chosen forms. */
  preset: Preset;
  /** Project whose forms are the apply targets. */
  projectId: string;
}

/**
 * "Apply across the project" — link a preset into many forms at once (Track B / P2,
 * the demo headline). The user picks target forms; each gets the preset appended as a
 * linked field, so a later edit to the preset re-propagates everywhere via
 * `resolveLinkedFields`. Per-form results are reported; partial success is fine.
 */
export function ApplyPresetModal({ open, onClose, preset, projectId }: ApplyPresetModalProps) {
  const { message } = AntApp.useApp();
  // Rendered only while a preset is being applied (PresetSection mounts it on demand), so
  // each open is a fresh mount — no reset effect needed.
  const { tree, loading } = useProjectTree(projectId);
  const apply = useApplyPreset(projectId);
  const [selected, setSelected] = useState<string[]>([]);
  const [report, setReport] = useState<{ applied: number; failed: number } | null>(null);

  const forms = tree?.forms ?? [];
  const allChecked = forms.length > 0 && selected.length === forms.length;
  const toggleAll = (checked: boolean) => setSelected(checked ? forms.map((f) => f.id) : []);

  async function onApply() {
    if (selected.length === 0) return;
    const result = await apply.mutateAsync({ preset, formIds: selected });
    setReport({ applied: result.applied.length, failed: result.failed.length });
    if (result.failed.length === 0) {
      message.success(`Đã thêm “${preset.name}” vào ${result.applied.length} biểu mẫu.`);
    } else {
      message.warning(
        `Đã thêm vào ${result.applied.length}, thất bại ${result.failed.length} biểu mẫu.`,
      );
    }
  }

  return (
    <Modal
      open={open}
      title={
        <Space>
          Áp dụng preset
          <Tag color="blue">{preset.name}</Tag>
        </Space>
      }
      onCancel={onClose}
      destroyOnHidden
      footer={[
        <Button key="close" onClick={onClose}>
          {report ? "Xong" : "Hủy"}
        </Button>,
        <Button
          key="apply"
          type="primary"
          loading={apply.isPending}
          disabled={selected.length === 0}
          onClick={onApply}
        >
          Áp dụng cho {selected.length || ""} biểu mẫu
        </Button>,
      ]}
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          Preset được thêm vào mỗi biểu mẫu đã chọn dưới dạng <b>trường liên kết</b>. Sửa preset sau
          này sẽ tự cập nhật mọi biểu mẫu liên kết.
        </Typography.Text>

        {report && (
          <Alert
            type={report.failed ? "warning" : "success"}
            showIcon
            message={`Đã áp dụng vào ${report.applied} biểu mẫu${report.failed ? `, ${report.failed} thất bại` : ""}.`}
          />
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <Spin />
          </div>
        ) : forms.length === 0 ? (
          <Empty description="Chưa có biểu mẫu trong dự án này" />
        ) : (
          <>
            <Checkbox checked={allChecked} onChange={(e) => toggleAll(e.target.checked)}>
              Chọn tất cả ({forms.length})
            </Checkbox>
            <div style={{ maxHeight: 280, overflow: "auto" }}>
              <Checkbox.Group
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
                value={selected}
                onChange={(v) => setSelected(v as string[])}
                options={forms.map((f) => ({ label: f.title || f.id, value: f.id }))}
              />
            </div>
          </>
        )}
      </Space>
    </Modal>
  );
}
