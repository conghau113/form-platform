import { AppstoreOutlined, DeleteOutlined, GlobalOutlined, PlusOutlined } from "@ant-design/icons";
import { Icon } from "@org/form-renderer-web";
import type { FieldNode, Preset } from "@org/form-schema";
import { Button, Input, Modal, message, Segmented, Tooltip, Typography } from "antd";
import { useMemo, useState } from "react";
import { useDesigner } from "../DesignCanvas";
import { DraggableChip } from "../PaletteChip";
import { presetFromField } from "./patch";
import type { PresetStore } from "./usePresets";

/** One preset chip. Pressing it starts a "create" drag that seeds a fresh field of
 *  `preset.fieldType` merged with `preset.patch`; user presets carry delete (and, for
 *  project-scoped presets, a "promote to global") actions. */
function PresetChip({
  preset,
  onDelete,
  onPromote,
}: {
  preset: Preset;
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
        (onPromote || onDelete) && (
          <>
            {onPromote && (
              <Tooltip title="Promote to global" placement="top">
                <Button
                  type="text"
                  size="small"
                  aria-label={`Promote ${preset.name} to global`}
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
                aria-label={`Delete ${preset.name}`}
                icon={<DeleteOutlined />}
                onPointerDown={stop}
                onClick={onDelete}
              />
            )}
          </>
        )
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
      message.success(`Saved preset "${name.trim()}"`);
      setOpen(false);
      setName("");
    } catch (e) {
      message.error(`Save preset failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Tooltip title="Save the selected field as a preset" placement="top">
        <Button
          type="text"
          size="small"
          aria-label="Save current field as preset"
          icon={<PlusOutlined />}
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      <Modal
        open={open}
        title="Save field as preset"
        okText="Save"
        okButtonProps={{ disabled: !name.trim(), loading: busy }}
        onOk={submit}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input
            autoFocus
            placeholder="Preset name"
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
  const { builtin, user, save, remove, promote } = presets;

  const onDelete = (id: string) => {
    remove(id).catch((e: Error) => message.error(`Delete preset failed: ${e.message}`));
  };
  const onPromote = (id: string) => {
    promote(id)
      .then(() => message.success("Promoted to global"))
      .catch((e: Error) => message.error(`Promote preset failed: ${e.message}`));
  };

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (p: Preset) => !q || p.name.toLowerCase().includes(q) || p.fieldType.includes(q);
    return { builtin: builtin.filter(match), user: user.filter(match) };
  }, [query, builtin, user]);

  // Hide the whole group when a search filters every preset out (keeps the rail tidy).
  if (matches.builtin.length === 0 && matches.user.length === 0 && query.trim()) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography.Text
          type="secondary"
          style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}
        >
          Presets
        </Typography.Text>
        {selectedField && <SaveButton field={selectedField} projectId={projectId} onSave={save} />}
      </div>
      {matches.builtin.map((p) => (
        <PresetChip key={p.id} preset={p} />
      ))}
      {matches.user.map((p) => (
        <PresetChip
          key={p.id}
          preset={p}
          onDelete={() => onDelete(p.id)}
          // Only project-scoped presets can be promoted (and only when a project is open).
          onPromote={projectId && p.scope === "project" ? () => onPromote(p.id) : undefined}
        />
      ))}
    </div>
  );
}
