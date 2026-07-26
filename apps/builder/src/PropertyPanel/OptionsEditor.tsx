import { Button, Input, Space } from "antd";
import { TranslatePopover } from "./TranslatePopover";

export type Option = {
  label: string;
  value: string | number;
  /** Localized overrides of `label`, keyed by locale code. */
  i18n?: Record<string, string>;
};

export function OptionsEditor({
  options,
  locales,
  onChange,
}: {
  options: Option[];
  /** Extra locales configured on the form; when non-empty each row gets a translate button. */
  locales?: string[];
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
            placeholder="nhãn"
            value={opt.label}
            onChange={(e) => update(i, { label: e.target.value })}
            style={{ width: 110 }}
          />
          <Input
            placeholder="giá trị"
            value={String(opt.value)}
            onChange={(e) => update(i, { value: e.target.value })}
            style={{ width: 90 }}
          />
          <TranslatePopover
            value={opt.label}
            i18n={opt.i18n}
            locales={locales ?? []}
            onChange={(next) => update(i, { i18n: next })}
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
        Thêm tùy chọn
      </Button>
    </div>
  );
}
