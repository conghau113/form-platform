import { AppstoreOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Icon } from "@org/form-renderer-web";
import type { FieldNode, Preset } from "@org/form-schema";
import { Button, Input, Modal, message, Tooltip, Typography } from "antd";
import { useMemo, useState } from "react";
import { useDesigner } from "../DesignCanvas";
import { DraggableChip } from "../PaletteChip";
import { presetFromField } from "./patch";
import { usePresets } from "./usePresets";

/** One preset chip. Pressing it starts a "create" drag that seeds a fresh field of
 *  `preset.fieldType` merged with `preset.patch`; user presets carry a delete button. */
function PresetChip({ preset, onDelete }: { preset: Preset; onDelete?: () => void }) {
  const { beginCreate } = useDesigner();
  return (
    <DraggableChip
      icon={preset.icon ? <Icon token={preset.icon} /> : <AppstoreOutlined />}
      label={preset.name}
      hint={`${preset.name} · ${preset.fieldType}`}
      onPointerDown={(e) =>
        beginCreate(preset.fieldType, e, { patch: preset.patch, label: preset.name })
      }
      extra={
        onDelete && (
          <Button
            type="text"
            size="small"
            aria-label={`Delete ${preset.name}`}
            icon={<DeleteOutlined />}
            // Stop the press from starting a create-drag on the chip behind it.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onDelete}
          />
        )
      }
    />
  );
}

/** "Save current field as preset" — a small modal that names the selected field and
 *  POSTs it as a user preset. Disabled (button hidden by the caller) when nothing is
 *  selected. */
function SaveButton({ field, onSave }: { field: FieldNode; onSave: (p: Preset) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave(presetFromField(name, field));
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
        <Input
          autoFocus
          placeholder="Preset name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPressEnter={submit}
        />
      </Modal>
    </>
  );
}

/** Presets group at the top of the palette: built-in + user presets as draggable chips,
 *  filtered by the palette's search `query`, plus a "save current field" action. */
export function PresetSection({
  query,
  selectedField,
}: {
  query: string;
  selectedField: FieldNode | null;
}) {
  const { builtin, user, save, remove } = usePresets();

  const onDelete = (id: string) => {
    remove(id).catch((e: Error) => message.error(`Delete preset failed: ${e.message}`));
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
        {selectedField && <SaveButton field={selectedField} onSave={save} />}
      </div>
      {matches.builtin.map((p) => (
        <PresetChip key={p.id} preset={p} />
      ))}
      {matches.user.map((p) => (
        <PresetChip key={p.id} preset={p} onDelete={() => onDelete(p.id)} />
      ))}
    </div>
  );
}
