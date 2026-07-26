import { TranslationOutlined } from "@ant-design/icons";
import { Button, Input, Popover } from "antd";

/** A compact 🌐 popover that edits a single string's per-locale translations — the flat
 *  `Record<locale, string>` `i18n` map carried by options and validation rules. One input
 *  per configured locale (the authored default is the placeholder); an empty input prunes
 *  that locale, and an empty map collapses to `undefined`. Renders nothing when no locales
 *  are configured, so callers can drop it in unconditionally. */
export function TranslatePopover({
  value,
  i18n,
  locales,
  onChange,
  title,
}: {
  /** The authored default string (shown as each input's placeholder). */
  value?: string;
  /** Current per-locale overrides. */
  i18n?: Record<string, string>;
  /** Locales the form offers translations for. */
  locales: string[];
  onChange: (next: Record<string, string> | undefined) => void;
  title?: string;
}) {
  if (!locales.length) return null;
  const setLocale = (locale: string, text: string) => {
    const next = { ...i18n };
    if (text.trim()) next[locale] = text;
    else delete next[locale];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <Popover
      trigger="click"
      title={title ?? `Bản dịch${value ? ` — ${value}` : ""}`}
      content={
        <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 200 }}>
          {locales.map((locale) => (
            <Input
              key={locale}
              size="small"
              addonBefore={locale}
              placeholder={value}
              value={i18n?.[locale] ?? ""}
              onChange={(e) => setLocale(locale, e.target.value)}
            />
          ))}
        </div>
      }
    >
      <Button
        type="text"
        size="small"
        aria-label="Dịch"
        title="Dịch"
        icon={<TranslationOutlined />}
      />
    </Popover>
  );
}
