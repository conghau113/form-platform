import { BUILTIN_ICON_TOKENS, Icon } from "@org/form-renderer-web";
import type { FieldNode } from "@org/form-schema";
import {
  AutoComplete,
  Checkbox,
  ColorPicker,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Slider,
} from "antd";
import { describeField, type KeyValuePair, type SettingDescriptor } from "../field-registry";
import { prop } from "./helpers";
import { JsonEditor } from "./JsonEditor";
import { KeyValueEditor } from "./KeyValueEditor";
import { type Option, OptionsEditor } from "./OptionsEditor";
import type { Patch } from "./types";

/** Renders the type-specific settings declared by the field's registry descriptor.
 *  Adding a new type/setting needs only a registry entry — no edit here. */
export function TypeSettings({
  field,
  set,
  locales,
}: {
  field: FieldNode;
  set: (patch: Patch) => void;
  /** Extra locales configured on the form; enables the per-option translate UI for
   *  static-option leaves (radio/select/...). */
  locales?: string[];
}) {
  const { settings } = describeField(field.type);
  return (
    <SettingControls
      settings={settings}
      get={(key) => prop(field, key)}
      set={(key, value) => set({ [key]: value } as Patch)}
      locales={locales}
    />
  );
}

/** Renders a list of {@link SettingDescriptor}s against arbitrary get/set accessors —
 *  the same descriptors drive a field's own props (TypeSettings) and the root Form's
 *  layoutProps (FormSettingsEditor). */
export function SettingControls({
  settings,
  get,
  set,
  locales,
}: {
  settings: SettingDescriptor[];
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  /** Threaded to the `options` control so static-option leaves get the translate UI. */
  locales?: string[];
}) {
  return (
    <>
      {settings.map((s) => {
        const setKey = (value: unknown) => set(s.key, value);
        switch (s.control) {
          case "text":
            return (
              <Form.Item key={s.key} label={s.label}>
                <Input
                  value={(get(s.key) as string) ?? ""}
                  onChange={(e) => setKey(e.target.value || undefined)}
                />
              </Form.Item>
            );
          case "textarea":
            return (
              <Form.Item key={s.key} label={s.label}>
                <Input.TextArea
                  rows={s.rows ?? 3}
                  value={(get(s.key) as string) ?? ""}
                  onChange={(e) => setKey(e.target.value || undefined)}
                />
              </Form.Item>
            );
          case "number":
            return (
              <Form.Item key={s.key} label={s.label}>
                <InputNumber
                  style={{ width: "100%" }}
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={(get(s.key) as number | null) ?? null}
                  onChange={(v) => setKey(v ?? undefined)}
                />
              </Form.Item>
            );
          case "checkbox":
            return (
              <Form.Item key={s.key}>
                <Checkbox
                  checked={!!get(s.key)}
                  onChange={(e) => setKey(e.target.checked || undefined)}
                >
                  {s.label}
                </Checkbox>
              </Form.Item>
            );
          case "select":
            return (
              <Form.Item key={s.key} label={s.label}>
                <Select
                  style={{ width: "100%" }}
                  allowClear
                  value={(get(s.key) as string) ?? undefined}
                  options={s.choices ?? []}
                  onChange={(v) => setKey(v ?? undefined)}
                />
              </Form.Item>
            );
          case "multiSelect":
            return (
              <Form.Item key={s.key} label={s.label}>
                <Select
                  mode="multiple"
                  style={{ width: "100%" }}
                  allowClear
                  value={(get(s.key) as string[]) ?? []}
                  options={s.choices ?? []}
                  onChange={(v) => setKey(v.length ? v : undefined)}
                />
              </Form.Item>
            );
          case "color":
            return (
              <Form.Item key={s.key} label={s.label}>
                <ColorPicker
                  allowClear
                  showText
                  value={(get(s.key) as string) ?? undefined}
                  onChange={(c) => setKey(c.toHexString())}
                  onClear={() => setKey(undefined)}
                />
              </Form.Item>
            );
          case "icon": {
            // A free-entry token picker with GLYPH PREVIEWS resolved through the renderer's
            // icon registry (I2). Suggestions come from the descriptor's `choices` or fall
            // back to the renderer's built-in tokens. The stored value stays the raw token
            // string ("antd:SearchOutlined"); an unknown token simply shows no glyph.
            const tokens = s.choices?.map((c) => c.value) ?? BUILTIN_ICON_TOKENS;
            const iconOptions = tokens.map((token) => ({
              value: token,
              label: (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Icon token={token} />
                  {token}
                </span>
              ),
            }));
            return (
              <Form.Item key={s.key} label={s.label}>
                <AutoComplete
                  style={{ width: "100%" }}
                  allowClear
                  placeholder="antd:SearchOutlined"
                  value={(get(s.key) as string) ?? ""}
                  options={iconOptions}
                  filterOption={(input, opt) =>
                    (opt?.value as string).toLowerCase().includes(input.toLowerCase())
                  }
                  onChange={(v) => setKey(v || undefined)}
                />
              </Form.Item>
            );
          }
          case "keyValue":
          case "marks":
            return (
              <Form.Item key={s.key} label={s.label}>
                <KeyValueEditor
                  pairs={(get(s.key) as KeyValuePair[]) ?? []}
                  numericKeys={s.control === "marks"}
                  keyLabel={s.keyLabel}
                  valueLabel={s.valueLabel}
                  onChange={(pairs) => setKey(pairs.length ? pairs : undefined)}
                />
              </Form.Item>
            );
          case "json":
            return (
              <Form.Item key={s.key} label={s.label}>
                <JsonEditor value={get(s.key)} rows={s.rows} onChange={setKey} />
              </Form.Item>
            );
          case "segmented":
            // Inline single-choice. Unlike `select` there is no clear affordance: an
            // unset value simply highlights no segment (the renderer falls back to its
            // default), and picking a segment always writes a concrete value.
            return (
              <Form.Item key={s.key} label={s.label}>
                <Segmented
                  value={(get(s.key) as string) ?? ""}
                  options={s.choices ?? []}
                  onChange={(v) => setKey((v as string) || undefined)}
                />
              </Form.Item>
            );
          case "slider":
            return (
              <Form.Item key={s.key} label={s.label}>
                <Slider
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={(get(s.key) as number | undefined) ?? s.min ?? 0}
                  onChange={(v) => setKey(v)}
                />
              </Form.Item>
            );
          case "options":
            return (
              <Form.Item key={s.key} label={s.label}>
                <OptionsEditor
                  options={(get(s.key) as Option[]) ?? []}
                  locales={locales}
                  onChange={(options) => setKey(options)}
                />
              </Form.Item>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
