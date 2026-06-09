import type { LeafField } from "@org/form-schema";
import { Button, Checkbox, Divider, Empty, Form, Input, InputNumber, Select, Space } from "antd";
import type { EditorField } from "./model";

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
        <Form.Item>
          <Checkbox
            checked={!!field.required}
            onChange={(e) => set({ required: e.target.checked || undefined })}
          >
            Required
          </Checkbox>
        </Form.Item>

        {/* Type-specific properties */}
        {(field.type === "text" || field.type === "textarea") && (
          <>
            <Form.Item label="Placeholder">
              <Input
                value={field.placeholder ?? ""}
                onChange={(e) => set({ placeholder: e.target.value || undefined })}
              />
            </Form.Item>
            <Form.Item label="Max length">
              <InputNumber
                style={{ width: "100%" }}
                value={field.maxLength ?? null}
                onChange={(v) => set({ maxLength: v ?? undefined })}
              />
            </Form.Item>
          </>
        )}
        {field.type === "textarea" && (
          <Form.Item label="Rows">
            <InputNumber
              style={{ width: "100%" }}
              value={field.rows ?? null}
              onChange={(v) => set({ rows: v ?? undefined })}
            />
          </Form.Item>
        )}
        {field.type === "number" && (
          <Space>
            <Form.Item label="Min">
              <InputNumber
                value={field.min ?? null}
                onChange={(v) => set({ min: v ?? undefined })}
              />
            </Form.Item>
            <Form.Item label="Max">
              <InputNumber
                value={field.max ?? null}
                onChange={(v) => set({ max: v ?? undefined })}
              />
            </Form.Item>
          </Space>
        )}
        {field.type === "select" && (
          <>
            <Form.Item>
              <Checkbox
                checked={!!field.multiple}
                onChange={(e) => set({ multiple: e.target.checked || undefined })}
              >
                Allow multiple
              </Checkbox>
            </Form.Item>
            <Form.Item label="Options">
              <OptionsEditor
                options={field.options ?? []}
                onChange={(options) => set({ options })}
              />
            </Form.Item>
          </>
        )}

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
