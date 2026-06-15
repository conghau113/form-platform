import { Button, Input, InputNumber, Space } from "antd";
import type { KeyValuePair } from "../field-registry";

/** A controlled editor for an ordered list of `{ key, value }` pairs — backs the
 *  `keyValue` and `marks` setter controls. Kept fully controlled (no internal draft
 *  state) so it stays correct when the property panel swaps the selected node without
 *  remounting; empty/in-progress rows live in the model exactly like {@link OptionsEditor}.
 *  With `numericKeys` the key cell is an `InputNumber` (e.g. slider tick positions). */
export function KeyValueEditor({
  pairs,
  onChange,
  numericKeys = false,
  keyLabel = "key",
  valueLabel = "value",
}: {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  numericKeys?: boolean;
  keyLabel?: string;
  valueLabel?: string;
}) {
  const update = (i: number, patch: Partial<KeyValuePair>) =>
    onChange(pairs.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {pairs.map((pair, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: pairs have no stable id; index is fine for this small editor
        <Space key={i}>
          {numericKeys ? (
            <InputNumber
              placeholder={keyLabel}
              value={pair.key === "" ? null : Number(pair.key)}
              onChange={(v) => update(i, { key: v == null ? "" : String(v) })}
              style={{ width: 110 }}
            />
          ) : (
            <Input
              placeholder={keyLabel}
              value={pair.key}
              onChange={(e) => update(i, { key: e.target.value })}
              style={{ width: 110 }}
            />
          )}
          <Input
            placeholder={valueLabel}
            value={pair.value}
            onChange={(e) => update(i, { value: e.target.value })}
            style={{ width: 110 }}
          />
          <Button
            type="text"
            size="small"
            danger
            aria-label="Remove row"
            onClick={() => onChange(pairs.filter((_, idx) => idx !== i))}
          >
            ✕
          </Button>
        </Space>
      ))}
      <Button size="small" onClick={() => onChange([...pairs, { key: "", value: "" }])}>
        Add row
      </Button>
    </div>
  );
}
