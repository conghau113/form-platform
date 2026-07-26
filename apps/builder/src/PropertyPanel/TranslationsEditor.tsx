import type { I18nMap } from "@org/form-schema";
import { Empty, Input, Typography } from "antd";
import type { TranslatableAttr } from "./translatable";

/** Edits a node's per-attribute, per-locale `i18n` overrides. Given the attrs that
 *  hold an authored string and the form's configured locales, it renders one input
 *  per (attr × locale). Empty inputs are pruned (locale → attr → whole map) so an
 *  untouched node serializes without an `i18n` block, mirroring the drop-when-empty
 *  discipline used for `layoutProps`/`settings`. Never localizes — pure data entry. */
export function TranslationsEditor({
  i18n,
  attrs,
  locales,
  onChange,
}: {
  i18n: I18nMap | undefined;
  attrs: TranslatableAttr[];
  locales: string[];
  onChange: (next: I18nMap | undefined) => void;
}) {
  const setValue = (attr: string, locale: string, value: string) => {
    const next: I18nMap = structuredClone(i18n ?? {});
    const byLocale = { ...(next[attr] ?? {}) };
    // Keep raw value so the user can type spaces; an empty input prunes the entry.
    if (value.trim()) byLocale[locale] = value;
    else delete byLocale[locale];
    if (Object.keys(byLocale).length) next[attr] = byLocale;
    else delete next[attr];
    onChange(Object.keys(next).length ? next : undefined);
  };

  if (!attrs.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có gì để dịch" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {attrs.map(({ attr, label, value }) => (
        <div key={attr}>
          <Typography.Text strong style={{ fontSize: 12 }}>
            {label}
          </Typography.Text>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: "0 0 4px" }}>
            {value}
          </Typography.Paragraph>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {locales.map((locale) => (
              <Input
                key={locale}
                size="small"
                addonBefore={locale}
                placeholder={value}
                value={i18n?.[attr]?.[locale] ?? ""}
                onChange={(e) => setValue(attr, locale, e.target.value)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
