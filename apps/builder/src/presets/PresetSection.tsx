import {
  AppstoreOutlined,
  DeleteOutlined,
  DeploymentUnitOutlined,
  GlobalOutlined,
  PlusOutlined,
  PushpinFilled,
  PushpinOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Icon } from "@org/form-renderer-web";
import type { FieldNode, Preset } from "@org/form-schema";
import { App as AntApp, Button, Input, Modal, Segmented, Space, Tooltip, Typography } from "antd";
import { useMemo, useState } from "react";
import { useDesigner } from "../canvas/DesignerContext";
import { usePins } from "../lib";
// Reach the chip file directly (not the `../palette` barrel) — the barrel pulls in Palette,
// which imports this preset module, so the barrel would form an import cycle.
import { DraggableChip } from "../palette/PaletteChip";
import { ApplyPresetModal } from "./ApplyPresetModal";
import { AiPresetModal } from "./ai";
import { presetFromField } from "./patch";
import type { PresetStore } from "./usePresets";

const PINNED_PRESETS_KEY = "palette.pinnedPresets";

/** One preset chip. Pressing it starts a "create" drag that seeds a fresh field of
 *  `preset.fieldType` merged with `preset.patch`; user presets carry delete (and, for
 *  project-scoped presets, a "promote to global") actions. */
function PresetChip({
  preset,
  pinned,
  onTogglePin,
  onApply,
  onDelete,
  onPromote,
}: {
  preset: Preset;
  pinned: boolean;
  onTogglePin: (id: string) => void;
  onApply?: () => void;
  onDelete?: () => void;
  onPromote?: () => void;
}) {
  const { beginCreate } = useDesigner();
  // Stop an action press from starting a create-drag on the chip behind it.
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <DraggableChip
      icon={preset.icon ? <Icon token={preset.icon} /> : <AppstoreOutlined />}
      label={preset.name}
      hint={`${preset.name} · ${preset.fieldType}`}
      onPointerDown={(e) =>
        beginCreate(preset.fieldType, e, { patch: preset.patch, label: preset.name })
      }
      extra={
        <>
          <Button
            type="text"
            size="small"
            aria-label={pinned ? `Bỏ ghim ${preset.name}` : `Ghim ${preset.name}`}
            icon={pinned ? <PushpinFilled /> : <PushpinOutlined />}
            onPointerDown={stop}
            onClick={() => onTogglePin(preset.id)}
          />
          {onApply && (
            <Tooltip title="Áp dụng cho các biểu mẫu trong dự án" placement="top">
              <Button
                type="text"
                size="small"
                aria-label={`Áp dụng ${preset.name} cho các biểu mẫu trong dự án`}
                icon={<DeploymentUnitOutlined />}
                onPointerDown={stop}
                onClick={onApply}
              />
            </Tooltip>
          )}
          {onPromote && (
            <Tooltip title="Nâng lên toàn cục" placement="top">
              <Button
                type="text"
                size="small"
                aria-label={`Nâng ${preset.name} lên toàn cục`}
                icon={<GlobalOutlined />}
                onPointerDown={stop}
                onClick={onPromote}
              />
            </Tooltip>
          )}
          {onDelete && (
            <Button
              type="text"
              size="small"
              aria-label={`Xóa ${preset.name}`}
              icon={<DeleteOutlined />}
              onPointerDown={stop}
              onClick={onDelete}
            />
          )}
        </>
      }
    />
  );
}

/** "Save current field as preset" — a small modal that names the selected field and
 *  POSTs it as a user preset. When a project is open the author chooses the scope
 *  (this project vs global, default project); standalone it always saves global. */
function SaveButton({
  field,
  projectId,
  onSave,
}: {
  field: FieldNode;
  projectId?: string;
  onSave: (p: Preset) => Promise<void>;
}) {
  const { message } = AntApp.useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"project" | "global">(projectId ? "project" : "global");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const scopeOpts =
        projectId && scope === "project"
          ? ({ scope: "project", projectId } as const)
          : ({ scope: "global" } as const);
      await onSave(presetFromField(name, field, scopeOpts));
      message.success(`Đã lưu preset "${name.trim()}"`);
      setOpen(false);
      setName("");
    } catch (e) {
      message.error(`Lưu preset thất bại: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Tooltip title="Lưu trường đang chọn thành preset" placement="top">
        <Button
          type="text"
          size="small"
          aria-label="Lưu trường hiện tại thành preset"
          icon={<PlusOutlined />}
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      <Modal
        open={open}
        title="Lưu trường thành preset"
        okText="Lưu"
        okButtonProps={{ disabled: !name.trim(), loading: busy }}
        onOk={submit}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input
            autoFocus
            placeholder="Tên preset"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={submit}
          />
          {projectId && (
            <Segmented
              block
              value={scope}
              onChange={(v) => setScope(v as "project" | "global")}
              options={[
                { label: "Dự án này", value: "project" },
                { label: "Toàn cục", value: "global" },
              ]}
            />
          )}
        </div>
      </Modal>
    </>
  );
}

/** "Generate a preset with AI" — opens the AI modal; the accepted preset is saved into
 *  the library via the shared store, so it appears in the gallery immediately. */
function GenerateButton({
  projectId,
  onSave,
}: {
  projectId?: string;
  onSave: (p: Preset) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title="Tạo preset trường tái dùng bằng AI" placement="top">
        <Button
          type="text"
          size="small"
          aria-label="Tạo preset bằng AI"
          icon={<ThunderboltOutlined />}
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      <AiPresetModal
        open={open}
        onClose={() => setOpen(false)}
        projectId={projectId}
        onSave={onSave}
      />
    </>
  );
}

/** Presets group at the top of the palette: built-in + user presets as draggable chips,
 *  filtered by the palette's search `query`, plus a "save current field" action. */
export function PresetSection({
  query,
  selectedField,
  projectId,
  presets,
}: {
  query: string;
  selectedField: FieldNode | null;
  /** Project context (W3): library is global ∪ this project; enables scope/promote actions. */
  projectId?: string;
  /** Shared preset store, lifted to App (W4) so this gallery + the preview agree. */
  presets: PresetStore;
}) {
  const { message } = AntApp.useApp();
  const { builtin, user, save, remove, promote } = presets;
  const { order, pinned, isPinned, toggle } = usePins(PINNED_PRESETS_KEY);
  // The preset currently being applied across the project (drives ApplyPresetModal).
  const [applying, setApplying] = useState<Preset | null>(null);

  const onDelete = (id: string) => {
    remove(id).catch((e: Error) => message.error(`Xóa preset thất bại: ${e.message}`));
  };
  const onPromote = (id: string) => {
    promote(id)
      .then(() => message.success("Đã nâng lên toàn cục"))
      .catch((e: Error) => message.error(`Nâng preset thất bại: ${e.message}`));
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (p: Preset) => !q || p.name.toLowerCase().includes(q) || p.fieldType.includes(q);
    // Pinned presets (across builtin + user) float into a "Pinned" subgroup at the top; the
    // rest keep their builtin/user grouping. User presets are tracked so the right actions
    // (delete/promote) follow a preset wherever it is rendered.
    const userIds = new Set(user.map((p) => p.id));
    const all = [...builtin.filter(match), ...user.filter(match)];
    return {
      pinned: all
        .filter((p) => pinned.has(p.id))
        .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
      builtin: builtin.filter((p) => match(p) && !pinned.has(p.id)),
      user: user.filter((p) => match(p) && !pinned.has(p.id)),
      isUser: (id: string) => userIds.has(id),
    };
  }, [query, builtin, user, order, pinned]);

  // Render a chip with the actions a user preset deserves (delete + optional promote).
  const chip = (p: Preset) => (
    <PresetChip
      key={p.id}
      preset={p}
      pinned={isPinned(p.id)}
      onTogglePin={toggle}
      // Apply across the project's forms — only meaningful when a project is open.
      onApply={projectId ? () => setApplying(p) : undefined}
      onDelete={matches.isUser(p.id) ? () => onDelete(p.id) : undefined}
      // Only project-scoped presets can be promoted (and only when a project is open).
      onPromote={
        matches.isUser(p.id) && projectId && p.scope === "project"
          ? () => onPromote(p.id)
          : undefined
      }
    />
  );

  // Hide the whole group when a search filters every preset out (keeps the rail tidy).
  if (
    matches.pinned.length === 0 &&
    matches.builtin.length === 0 &&
    matches.user.length === 0 &&
    query.trim()
  )
    return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography.Text
          type="secondary"
          style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}
        >
          Preset
        </Typography.Text>
        <Space size={0}>
          <GenerateButton projectId={projectId} onSave={save} />
          {selectedField && (
            <SaveButton field={selectedField} projectId={projectId} onSave={save} />
          )}
        </Space>
      </div>
      {matches.pinned.length > 0 && (
        <Typography.Text type="secondary" style={{ fontSize: 11, opacity: 0.7 }}>
          Đã ghim
        </Typography.Text>
      )}
      {matches.pinned.map(chip)}
      {matches.builtin.map(chip)}
      {matches.user.map(chip)}
      {applying && projectId && (
        <ApplyPresetModal
          open={!!applying}
          onClose={() => setApplying(null)}
          preset={applying}
          projectId={projectId}
        />
      )}
    </div>
  );
}
