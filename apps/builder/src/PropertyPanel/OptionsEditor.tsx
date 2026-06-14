import { Button, Input, Space } from "antd";

export type Option = { label: string; value: string | number };

export function OptionsEditor({
  options,
  onChange,
}: {
  options: Option[];
  onChange: (options: Option[]) => void;
}) {
  const update = (i: number, patch: Partial<Option>) =>
    onChange(options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {options.map((opt, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: options have no stable id; index is fine for this small editor
        <Space key={i}>
          <Input
            placeholder="label"
            value={opt.label}
            onChange={(e) => update(i, { label: e.target.value })}
            style={{ width: 110 }}
          />
          <Input
            placeholder="value"
            value={String(opt.value)}
            onChange={(e) => update(i, { value: e.target.value })}
            style={{ width: 90 }}
          />
          <Button
            type="text"
            size="small"
            danger
            onClick={() => onChange(options.filter((_, idx) => idx !== i))}
          >
            ✕
          </Button>
        </Space>
      ))}
      <Button size="small" onClick={() => onChange([...options, { label: "", value: "" }])}>
        Add option
      </Button>
    </div>
  );
}
