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
        <Form.Item label="Tiêu đề">
          <Input value={form.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Form.Item>
        <Form.Item label="ID biểu mẫu">
          <Input value={form.id} onChange={(e) => onChange({ id: e.target.value })} />
        </Form.Item>

        <Divider orientation="left" plain>
          Bố cục
        </Divider>
        <SettingControls
          settings={FORM_META.settings}
          get={(key) => (layout as Record<string, unknown>)[key]}
          set={setLayoutKey}
        />
        <Space>
          <Form.Item label="Cột nhãn (span)">
            <InputNumber
              min={0}
              max={24}
              style={{ width: 100 }}
              value={colSpan("labelCol")}
              onChange={(v) => setColSpan("labelCol", v)}
            />
          </Form.Item>
          <Form.Item label="Cột nội dung (span)">
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
          Kiểm tra
        </Divider>
        <Form.Item
          label="Kiểm tra khi"
          tooltip="Thời điểm renderer chạy kiểm tra. Mặc định: khi gửi."
        >
          <Select
            allowClear
            placeholder="Khi gửi (mặc định)"
            style={{ width: 200 }}
            value={(settings.validateTrigger as string | undefined) ?? undefined}
            options={[
              { label: "Khi đang gõ", value: "onInput" },
              { label: "Khi rời ô", value: "onBlur" },
              { label: "Khi gửi", value: "onSubmit" },
            ]}
            onChange={(v) => setSettingKey("validateTrigger", v)}
          />
        </Form.Item>

        <Divider orientation="left" plain>
          Ngôn ngữ
        </Divider>
        <Form.Item
          label="Ngôn ngữ mặc định"
          tooltip="Ngôn ngữ mà các chuỗi được soạn (mặc định ngầm định)."
        >
          <Input
            placeholder="vd en"
            style={{ width: 200 }}
            value={form.defaultLocale ?? ""}
            onChange={(e) => onChange({ defaultLocale: e.target.value || undefined })}
          />
        </Form.Item>
        <Form.Item
          label="Ngôn ngữ khác"
          tooltip="Các ngôn ngữ khác biểu mẫu cung cấp bản dịch. Nhập mã (vd vi) rồi Enter."
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
