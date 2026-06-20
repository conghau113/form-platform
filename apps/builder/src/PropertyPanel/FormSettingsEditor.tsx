import type { FormLayoutProps } from "@org/form-schema";
import { Divider, Form, Input, InputNumber, Select, Space } from "antd";
import type { FormProps } from "../engine/tree";
import { FORM_META } from "../field-registry";
import { TranslationsEditor } from "./TranslationsEditor";
import { SettingControls } from "./TypeSettings";
import { translatableAttrs } from "./translatable";

/** The root Form's settings editor: identity (id/title) + the FORM_META layout
 *  descriptors mapped onto `form.layoutProps`, plus labelCol/wrapperCol spans.
 *  Entirely descriptor-driven — new form settings need only a FORM_SETTINGS entry. */
export function FormSettingsEditor({
  form,
  onChange,
}: {
  form: FormProps;
  onChange: (patch: Partial<FormProps>) => void;
}) {
  const layout = form.layoutProps ?? {};
  // An undefined value removes the key; an empty layoutProps is dropped entirely
  // so untouched forms keep serializing without the optional block.
  const setLayoutKey = (key: string, value: unknown) => {
    const next = { ...layout, [key]: value } as Record<string, unknown>;
    if (value === undefined) delete next[key];
    onChange({ layoutProps: Object.keys(next).length ? (next as FormLayoutProps) : undefined });
  };
  // `settings` (submitUrl, validateTrigger) is a separate optional block from
  // layoutProps; same drop-when-empty merge so untouched forms serialize clean.
  const settings = (form.settings ?? {}) as Record<string, unknown>;
  const setSettingKey = (key: string, value: unknown) => {
    const next = { ...settings, [key]: value };
    if (value === undefined) delete next[key];
    onChange({
      settings: Object.keys(next).length ? (next as FormProps["settings"]) : undefined,
    });
  };
  const locales = form.locales ?? [];
  const colSpan = (col: "labelCol" | "wrapperCol") => layout[col]?.span ?? null;
  // Merge over the existing col object so an authored `offset` survives span edits.
  const setColSpan = (col: "labelCol" | "wrapperCol", span: number | null) =>
    setLayoutKey(col, span == null ? undefined : { ...layout[col], span });

  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%" }}>
      <Form layout="vertical" size="small">
        <Form.Item label="Title">
          <Input value={form.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Form.Item>
        <Form.Item label="Form id">
          <Input value={form.id} onChange={(e) => onChange({ id: e.target.value })} />
        </Form.Item>

        <Divider orientation="left" plain>
          Layout
        </Divider>
        <SettingControls
          settings={FORM_META.settings}
          get={(key) => (layout as Record<string, unknown>)[key]}
          set={setLayoutKey}
        />
        <Space>
          <Form.Item label="Label col (span)">
            <InputNumber
              min={0}
              max={24}
              style={{ width: 100 }}
              value={colSpan("labelCol")}
              onChange={(v) => setColSpan("labelCol", v)}
            />
          </Form.Item>
          <Form.Item label="Wrapper col (span)">
            <InputNumber
              min={0}
              max={24}
              style={{ width: 100 }}
              value={colSpan("wrapperCol")}
              onChange={(v) => setColSpan("wrapperCol", v)}
            />
          </Form.Item>
        </Space>

        <Divider orientation="left" plain>
          Validation
        </Divider>
        <Form.Item
          label="Validate when"
          tooltip="When the renderer runs validation. Default: on submit."
        >
          <Select
            allowClear
            placeholder="On submit (default)"
            style={{ width: 200 }}
            value={(settings.validateTrigger as string | undefined) ?? undefined}
            options={[
              { label: "While typing", value: "onInput" },
              { label: "On blur", value: "onBlur" },
              { label: "On submit", value: "onSubmit" },
            ]}
            onChange={(v) => setSettingKey("validateTrigger", v)}
          />
        </Form.Item>

        <Divider orientation="left" plain>
          Localization
        </Divider>
        <Form.Item
          label="Default locale"
          tooltip="The language the authored strings are written in (the implicit default)."
        >
          <Input
            placeholder="e.g. en"
            style={{ width: 200 }}
            value={form.defaultLocale ?? ""}
            onChange={(e) => onChange({ defaultLocale: e.target.value || undefined })}
          />
        </Form.Item>
        <Form.Item
          label="Other locales"
          tooltip="Extra languages this form offers translations for. Type a code (e.g. vi) and press Enter."
        >
          <Select
            mode="tags"
            placeholder="vi, fr, …"
            style={{ width: "100%" }}
            value={locales}
            tokenSeparators={[",", " "]}
            onChange={(next: string[]) => onChange({ locales: next.length ? next : undefined })}
          />
        </Form.Item>
        {/* Title translations appear once at least one other locale is configured. */}
        {locales.length > 0 && (
          <TranslationsEditor
            i18n={form.i18n}
            attrs={translatableAttrs(form as unknown as Record<string, unknown>)}
            locales={locales}
            onChange={(next) => onChange({ i18n: next })}
          />
        )}
      </Form>
    </div>
  );
}
