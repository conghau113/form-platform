import { TranslationOutlined } from "@ant-design/icons";
import { Button, Input, Popover, Space } from "antd";

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
  // Set/clear one locale's translation on an option, pruning an empty i18n map.
  const setI18n = (i: number, locale: string, value: string) => {
    const opt = options[i];
    const next = { ...opt.i18n };
    if (value.trim()) next[locale] = value;
    else delete next[locale];
    update(i, { i18n: Object.keys(next).length ? next : undefined });
  };
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
          {!!locales?.length && (
            <Popover
              trigger="click"
              title={`Translations — ${opt.label || "(option)"}`}
              content={
                <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 200 }}>
                  {locales.map((locale) => (
                    <Input
                      key={locale}
                      size="small"
                      addonBefore={locale}
                      placeholder={opt.label}
                      value={opt.i18n?.[locale] ?? ""}
                      onChange={(e) => setI18n(i, locale, e.target.value)}
                    />
                  ))}
                </div>
              }
            >
              <Button
                type="text"
                size="small"
                aria-label="Translate option"
                title="Translate option"
                icon={<TranslationOutlined />}
              />
            </Popover>
          )}
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
