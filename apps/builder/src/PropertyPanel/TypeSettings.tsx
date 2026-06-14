import type { FieldNode } from "@org/form-schema";
import { Checkbox, Form, Input, InputNumber, Segmented, Select, Slider } from "antd";
import { describeField, type SettingDescriptor } from "../field-registry";
import { prop } from "./helpers";
import { type Option, OptionsEditor } from "./OptionsEditor";
import type { Patch } from "./types";

/** Renders the type-specific settings declared by the field's registry descriptor.
 *  Adding a new type/setting needs only a registry entry — no edit here. */
export function TypeSettings({ field, set }: { field: FieldNode; set: (patch: Patch) => void }) {
  const { settings } = describeField(field.type);
  return (
    <SettingControls
      settings={settings}
      get={(key) => prop(field, key)}
      set={(key, value) => set({ [key]: value } as Patch)}
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
}: {
  settings: SettingDescriptor[];
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
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
