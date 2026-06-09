import type { LeafField, ValidationRule } from "@org/form-schema";
import { Button, Checkbox, Divider, Empty, Form, Input, InputNumber, Select, Space } from "antd";
import { describeField, type ValidationRuleType } from "./field-registry";
import type { EditorField } from "./model";

const RULE_LABELS: Record<ValidationRuleType, string> = {
  required: "Required",
  len: "Exact length",
  min: "Min",
  max: "Max",
  pattern: "Pattern (regex)",
  format: "Format",
};
const FORMAT_OPTIONS = [
  { label: "Email", value: "email" },
  { label: "URL", value: "url" },
  { label: "Phone", value: "phone" },
];

/** A breakpoint colSpan; antd Col span is 1..24. */
type ColKey = "xs" | "sm" | "md" | "lg";
const COL_KEYS: ColKey[] = ["xs", "sm", "md", "lg"];

type Patch = Partial<LeafField>;

/** Read the field name referenced by a simple `{ "==": [{var}, value] }` rule, if any. */
function readEquals(field: LeafField): { field: string; value: string } | null {
  const rule = field.visibleWhen?.rule as { "=="?: unknown } | undefined;
  const eq = rule?.["=="];
  if (!Array.isArray(eq) || eq.length !== 2) return null;
  const left = eq[0] as { var?: string } | undefined;
  if (!left || typeof left.var !== "string") return null;
  return { field: left.var, value: String(eq[1] ?? "") };
}

function csv(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}
function parseCsv(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Right column: edits the selected field. Every change emits a shallow patch. */
export function PropertyPanel({
  selected,
  siblings,
  onChange,
}: {
  selected: EditorField | null;
  /** Other field names, candidates for a visibleWhen condition. */
  siblings: EditorField[];
  onChange: (uid: string, patch: Patch) => void;
}) {
  if (!selected) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="Select a field to edit its properties" />
      </div>
    );
  }

  const { uid, field } = selected;
  const set = (patch: Patch) => onChange(uid, patch);

  const colSpan = field.layout?.colSpan ?? {};
  const setColSpan = (key: ColKey, value: number | null) => {
    const next = { ...colSpan };
    if (value == null) delete next[key];
    else next[key] = value;
    const hasAny = Object.keys(next).length > 0;
    set({
      layout: {
        ...field.layout,
        colSpan: hasAny ? next : undefined,
      },
    });
  };

  const equals = readEquals(field);
  const condFields = siblings.filter((s) => s.field.name !== field.name);

  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%" }}>
      <Form layout="vertical" size="small">
        <Form.Item label="Label">
          <Input value={field.label} onChange={(e) => set({ label: e.target.value })} />
        </Form.Item>
        <Form.Item label="Name (schema key)">
          <Input value={field.name} onChange={(e) => set({ name: e.target.value })} />
        </Form.Item>
        <Form.Item label="Help text">
          <Input
            value={field.helpText ?? ""}
            onChange={(e) => set({ helpText: e.target.value || undefined })}
          />
        </Form.Item>
        <Form.Item label="Tooltip">
          <Input
            value={field.tooltip ?? ""}
            onChange={(e) => set({ tooltip: e.target.value || undefined })}
          />
        </Form.Item>
        <Space>
          <Form.Item>
            <Checkbox
              checked={!!field.required}
              onChange={(e) => set({ required: e.target.checked || undefined })}
            >
              Required
            </Checkbox>
          </Form.Item>
          <Form.Item>
            <Checkbox
              checked={!!field.disabled}
              onChange={(e) => set({ disabled: e.target.checked || undefined })}
            >
              Disabled
            </Checkbox>
          </Form.Item>
        </Space>

        {/* Type-specific properties, driven by the registry descriptor */}
        <TypeSettings field={field} set={set} />
        <DefaultValueEditor field={field} set={set} />

        <ValidationEditor field={field} set={set} />

        <Divider orientation="left" plain>
          Layout
        </Divider>
        <Space wrap>
          {COL_KEYS.map((key) => (
            <Form.Item key={key} label={`colSpan ${key}`}>
              <InputNumber
                min={1}
                max={24}
                style={{ width: 80 }}
                value={colSpan[key] ?? null}
                onChange={(v) => setColSpan(key, v)}
              />
            </Form.Item>
          ))}
        </Space>
        <Form.Item>
          <Checkbox
            checked={!!field.layout?.hideOnMobile}
            onChange={(e) =>
              set({ layout: { ...field.layout, hideOnMobile: e.target.checked || undefined } })
            }
          >
            Hide on mobile
          </Checkbox>
        </Form.Item>

        <Divider orientation="left" plain>
          Visibility
        </Divider>
        <Form.Item label="Show this field">
          <Select
            value={equals ? "when" : "always"}
            onChange={(mode) => {
              if (mode === "always") set({ visibleWhen: undefined });
              else {
                const first = condFields[0]?.field.name ?? "";
                set({ visibleWhen: { rule: { "==": [{ var: first }, ""] } } });
              }
            }}
            options={[
              { label: "Always", value: "always" },
              { label: "When a field equals a value", value: "when" },
            ]}
          />
        </Form.Item>
        {equals && (
          <Space>
            <Form.Item label="Field">
              <Select
                style={{ width: 130 }}
                value={equals.field}
                onChange={(name) =>
                  set({ visibleWhen: { rule: { "==": [{ var: name }, equals.value] } } })
                }
                options={condFields.map((s) => ({ label: s.field.name, value: s.field.name }))}
              />
            </Form.Item>
            <Form.Item label="Equals">
              <Input
                value={equals.value}
                onChange={(e) =>
                  set({ visibleWhen: { rule: { "==": [{ var: equals.field }, e.target.value] } } })
                }
              />
            </Form.Item>
          </Space>
        )}

        <Divider orientation="left" plain>
          Permissions
        </Divider>
        <Form.Item label="View roles (comma-separated)">
          <Input
            value={csv(field.permissions?.viewRoles)}
            onChange={(e) => {
              const viewRoles = parseCsv(e.target.value);
              set({
                permissions: mergePermissions(field, {
                  viewRoles: viewRoles.length ? viewRoles : undefined,
                }),
              });
            }}
          />
        </Form.Item>
        <Form.Item label="Edit roles (comma-separated)">
          <Input
            value={csv(field.permissions?.editRoles)}
            onChange={(e) => {
              const editRoles = parseCsv(e.target.value);
              set({
                permissions: mergePermissions(field, {
                  editRoles: editRoles.length ? editRoles : undefined,
                }),
              });
            }}
          />
        </Form.Item>
      </Form>
    </div>
  );
}

/** Read a dynamic property off a leaf field without widening its type to `any`. */
function prop(field: LeafField, key: string): unknown {
  return (field as Record<string, unknown>)[key];
}

/** Renders the type-specific settings declared by the field's registry descriptor.
 *  Adding a new type/setting needs only a registry entry — no edit here. */
function TypeSettings({ field, set }: { field: LeafField; set: (patch: Patch) => void }) {
  const { settings } = describeField(field.type);
  return (
    <>
      {settings.map((s) => {
        const setKey = (value: unknown) => set({ [s.key]: value } as Patch);
        switch (s.control) {
          case "text":
            return (
              <Form.Item key={s.key} label={s.label}>
                <Input
                  value={(prop(field, s.key) as string) ?? ""}
                  onChange={(e) => setKey(e.target.value || undefined)}
                />
              </Form.Item>
            );
          case "number":
            return (
              <Form.Item key={s.key} label={s.label}>
                <InputNumber
                  style={{ width: "100%" }}
                  value={(prop(field, s.key) as number | null) ?? null}
                  onChange={(v) => setKey(v ?? undefined)}
                />
              </Form.Item>
            );
          case "checkbox":
            return (
              <Form.Item key={s.key}>
                <Checkbox
                  checked={!!prop(field, s.key)}
                  onChange={(e) => setKey(e.target.checked || undefined)}
                >
                  {s.label}
                </Checkbox>
              </Form.Item>
            );
          case "options":
            return (
              <Form.Item key={s.key} label={s.label}>
                <OptionsEditor
                  options={(prop(field, s.key) as Option[]) ?? []}
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

/** A small "Default value" editor whose control follows the registry descriptor's
 *  `defaultValueKind`. Date/time types declare "none" (value shape is platform-specific). */
function DefaultValueEditor({ field, set }: { field: LeafField; set: (patch: Patch) => void }) {
  const { defaultValueKind } = describeField(field.type);
  if (defaultValueKind === "none") return null;
  const dv = prop(field, "defaultValue");
  const setDefault = (value: unknown) => set({ defaultValue: value } as Patch);
  return (
    <Form.Item label="Default value">
      {defaultValueKind === "boolean" ? (
        <Checkbox checked={!!dv} onChange={(e) => setDefault(e.target.checked || undefined)} />
      ) : defaultValueKind === "number" ? (
        <InputNumber
          style={{ width: "100%" }}
          value={(dv as number | null) ?? null}
          onChange={(v) => setDefault(v ?? undefined)}
        />
      ) : (
        <Input
          value={(dv as string) ?? ""}
          onChange={(e) => setDefault(e.target.value || undefined)}
        />
      )}
    </Form.Item>
  );
}

/** A "Validation" section whose available rule kinds come from the registry
 *  descriptor. Each rule edits a `{ type, value?, format?, message? }` entry that
 *  form-core compiles to Zod. Hidden when the type declares no validation kinds. */
function ValidationEditor({ field, set }: { field: LeafField; set: (patch: Patch) => void }) {
  const { validations: allowed } = describeField(field.type);
  if (!allowed || allowed.length === 0) return null;
  const rules = field.validations ?? [];
  const commit = (next: ValidationRule[]) =>
    set({ validations: next.length ? next : undefined } as Patch);
  const update = (i: number, patch: Partial<ValidationRule>) =>
    commit(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => commit(rules.filter((_, idx) => idx !== i));
  const add = () => commit([...rules, { type: allowed[0] }]);

  const ruleOptions = allowed.map((t) => ({ label: RULE_LABELS[t], value: t }));

  return (
    <>
      <Divider orientation="left" plain>
        Validation
      </Divider>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rules.map((rule, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rules have no stable id; index is fine for this small editor
          <Space key={i} wrap align="start">
            <Select
              style={{ width: 130 }}
              value={rule.type}
              options={ruleOptions}
              onChange={(type: ValidationRuleType) =>
                update(i, {
                  type,
                  value: undefined,
                  format: type === "format" ? "email" : undefined,
                })
              }
            />
            {(rule.type === "len" || rule.type === "min" || rule.type === "max") && (
              <InputNumber
                style={{ width: 90 }}
                placeholder="value"
                value={(rule.value as number | null) ?? null}
                onChange={(v) => update(i, { value: v ?? undefined })}
              />
            )}
            {rule.type === "pattern" && (
              <Input
                style={{ width: 130 }}
                placeholder="regex source"
                value={(rule.value as string) ?? ""}
                onChange={(e) => update(i, { value: e.target.value })}
              />
            )}
            {rule.type === "format" && (
              <Select
                style={{ width: 100 }}
                value={rule.format ?? "email"}
                options={FORMAT_OPTIONS}
                onChange={(format: ValidationRule["format"]) => update(i, { format })}
              />
            )}
            <Input
              style={{ width: 140 }}
              placeholder="message (optional)"
              value={rule.message ?? ""}
              onChange={(e) => update(i, { message: e.target.value || undefined })}
            />
            <Button type="text" size="small" danger onClick={() => remove(i)}>
              ✕
            </Button>
          </Space>
        ))}
        <Button size="small" onClick={add}>
          Add rule
        </Button>
      </div>
    </>
  );
}

/** Merge a permissions patch, dropping the object entirely when it becomes empty. */
function mergePermissions(
  field: LeafField,
  patch: { viewRoles?: string[]; editRoles?: string[] },
): LeafField["permissions"] {
  const next = { ...field.permissions, ...patch };
  if (!next.viewRoles) delete next.viewRoles;
  if (!next.editRoles) delete next.editRoles;
  return Object.keys(next).length ? next : undefined;
}

type Option = { label: string; value: string | number };

function OptionsEditor({
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
