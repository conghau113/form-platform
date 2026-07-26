import type { ArrayField, FieldNode } from "@org/form-schema";
import { Button, Checkbox, Divider, Form, Input, Segmented, Select, Space, Typography } from "antd";
import { type FieldType, fieldTypeLabel, newField, PALETTE_TYPES } from "../field-registry";
import { nodeLabel, nodeName, prop } from "./helpers";
import type { Patch } from "./types";

/** Item-field types offered inside an array row: every palette-visible leaf type (the
 *  `array` container itself is excluded — no nested arrays in this minimal editor). */
const ITEM_TYPES: FieldType[] = PALETTE_TYPES.filter((t) => t !== "array");

/** A compact, non-DnD editor for an array node's repeated `itemFields`. Authors the
 *  row "columns" (type/label/name + reorder/remove) and picks the display variant.
 *  "Configure" drills into an item to edit it with the full property panel. */
export function ItemFieldsEditor({
  field,
  set,
  onConfigure,
}: {
  field: ArrayField;
  set: (patch: Patch) => void;
  /** Open the full editor for the item field at `index` (PropertyPanel drill-in). */
  onConfigure: (index: number) => void;
}) {
  const items = field.itemFields;
  const commit = (next: FieldNode[]) => set({ itemFields: next } as Patch);
  const update = (i: number, next: FieldNode) =>
    commit(items.map((it, idx) => (idx === i ? next : it)));
  const remove = (i: number) => commit(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const namesExcept = (i: number) =>
    new Set(
      items
        .filter((_, idx) => idx !== i)
        .map((f) => nodeName(f))
        .filter((n): n is string => Boolean(n)),
    );
  const add = () => commit([...items, newField("text", namesExcept(-1))]);
  // Change an item's type, keeping its name/label/required and reseeding the rest.
  const changeType = (i: number, type: FieldType) => {
    const it = items[i];
    // ITEM_TYPES only offers named leaf types, so the seed always has a name/label.
    const seeded = newField(type, namesExcept(i));
    update(i, {
      ...seeded,
      name: nodeName(it) ?? nodeName(seeded),
      label: nodeLabel(it) ?? nodeLabel(seeded),
      required: (prop(it, "required") as boolean | undefined) || undefined,
    } as FieldNode);
  };

  return (
    <>
      <Divider orientation="left" plain>
        Trường của mục
      </Divider>
      <Form.Item label="Hiển thị">
        <Segmented
          value={field.variant ?? "card"}
          onChange={(v) => set({ variant: v as ArrayField["variant"] } as Patch)}
          options={[
            { label: "Thẻ", value: "card" },
            { label: "Bảng", value: "table" },
          ]}
        />
      </Form.Item>
      {field.variant === "table" ? (
        <Form.Item>
          <Checkbox
            checked={field.editInDialog ?? false}
            onChange={(e) => set({ editInDialog: e.target.checked || undefined } as Patch)}
          >
            Sửa hàng trong hộp thoại
          </Checkbox>
        </Form.Item>
      ) : null}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Các cột lặp lại cho mỗi hàng. Dùng Cấu hình để chỉnh đầy đủ (tùy chọn, kiểm tra, giá trị mặc
        định…).
      </Typography.Text>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {items.map((it, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: item fields have no stable id; index is fine for this small editor
          <Space key={i} wrap align="start">
            <Select
              style={{ width: 110 }}
              // A loaded item could be a `group` (not authorable here); it shows blank.
              value={it.type as FieldType}
              options={ITEM_TYPES.map((t) => ({ label: fieldTypeLabel(t), value: t }))}
              onChange={(t: FieldType) => changeType(i, t)}
            />
            <Input
              style={{ width: 100 }}
              placeholder="nhãn"
              value={nodeLabel(it) ?? ""}
              onChange={(e) => update(i, { ...it, label: e.target.value } as FieldNode)}
            />
            <Input
              style={{ width: 90 }}
              placeholder="tên"
              value={nodeName(it) ?? ""}
              onChange={(e) => update(i, { ...it, name: e.target.value } as FieldNode)}
            />
            <Button size="small" onClick={() => onConfigure(i)}>
              Cấu hình
            </Button>
            <Button type="text" size="small" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </Button>
            <Button
              type="text"
              size="small"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </Button>
            <Button type="text" size="small" danger onClick={() => remove(i)}>
              ✕
            </Button>
          </Space>
        ))}
        <Button size="small" onClick={add}>
          Add item field
        </Button>
      </div>
    </>
  );
}
