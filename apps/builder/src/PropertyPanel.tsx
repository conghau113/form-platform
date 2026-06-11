import {
  type ArrayField,
  childrenOf,
  type FieldNode,
  isLayoutContainer,
  type LeafField,
  type ValidationRule,
} from "@org/form-schema";
import {
  Button,
  Checkbox,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Typography,
} from "antd";
import { useEffect, useState } from "react";
import { type NodePath, nodeAtPath, patchNodeAtPath } from "./engine/field-path";
import {
  describeField,
  type FieldType,
  fieldTypeLabel,
  newField,
  PALETTE_TYPES,
  type ValidationRuleType,
} from "./field-registry";

/** The leaf/array nodes the full field editor handles. Layout containers render a
 *  minimal settings-only editor instead (they are nameless / value-transparent). */
type AuthoredField = LeafField | ArrayField;

/** The PropertyPanel's selected node: a uid plus the resolved schema field. */
export interface SelectedNode {
  uid: string;
  field: FieldNode;
}

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

type Patch = Partial<AuthoredField>;

/** Read the field name referenced by a simple `{ "==": [{var}, value] }` rule, if any. */
function readEquals(field: AuthoredField): { field: string; value: string } | null {
  const rule = field.visibleWhen?.rule as { "=="?: unknown } | undefined;
  const eq = rule?.["=="];
  if (!Array.isArray(eq) || eq.length !== 2) return null;
  const left = eq[0] as { var?: string } | undefined;
  if (!left || typeof left.var !== "string") return null;
  return { field: left.var, value: String(eq[1] ?? "") };
}

/** Identity accessors tolerant of nameless layout containers (tabs/card/...)
 *  that can appear in loaded JSON among item fields. */
function nodeName(node: FieldNode): string | undefined {
  return "name" in node ? node.name : undefined;
}
function nodeLabel(node: FieldNode): string | undefined {
  if ("label" in node && node.label) return node.label;
  if ("title" in node && node.title) return node.title;
  return undefined;
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

/** Labels along a drill path, for the breadcrumb (root field + each drilled child). */
function pathCrumbs(root: FieldNode, path: NodePath): string[] {
  const crumbs = [nodeLabel(root) || nodeName(root) || root.type];
  let node: FieldNode = root;
  for (const index of path) {
    const child = childrenOf(node)?.[index];
    if (!child) break;
    node = child;
    crumbs.push(nodeLabel(child) || nodeName(child) || `#${index}`);
  }
  return crumbs;
}

/** Right column: edits the selected field, drilling into an array's item fields so a
 *  nested item gets the full editor. A change at depth `path` is rebuilt into a single
 *  patch on the top-level field via `patchNodeAtPath`, so App's onChange is unchanged. */
export function PropertyPanel({
  selected,
  siblingNames: topSiblingNames,
  onChange,
}: {
  selected: SelectedNode | null;
  /** Top-level field names, candidates for a visibleWhen condition. */
  siblingNames: string[];
  /** Emits the rebuilt top-level node (App swaps it into the tree via replaceField). */
  onChange: (uid: string, field: FieldNode) => void;
}) {
  const [drillPath, setDrillPath] = useState<NodePath>([]);
  // Leaving the current node resets the drill; a stale path (e.g. after undo) too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the selected node changes
  useEffect(() => setDrillPath([]), [selected?.uid]);

  if (!selected) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="Select a field to edit its properties" />
      </div>
    );
  }

  const { uid, field: root } = selected;
  // Resolve the drilled node; if the path no longer resolves, fall back to the root.
  const resolved = nodeAtPath(root, drillPath);
  const path = resolved ? drillPath : [];
  const node = resolved ?? root;

  // `patchNodeAtPath` returns the WHOLE rebuilt top-level node; App's replaceField then
  // swaps it into the tree. (Not a partial patch — it carries every key, so a removed
  // key is reflected because the whole node is re-emitted.)
  const set = (patch: Patch) => onChange(uid, patchNodeAtPath(root, path, patch));

  const crumbs = pathCrumbs(root, path);
  const breadcrumb = path.length > 0 && (
    <div style={{ marginBottom: 8 }}>
      {crumbs.map((label, depth) =>
        depth < crumbs.length - 1 ? (
          <Button
            // biome-ignore lint/suspicious/noArrayIndexKey: crumb position is its identity
            key={depth}
            type="link"
            size="small"
            style={{ padding: 0, height: "auto" }}
            onClick={() => setDrillPath(path.slice(0, depth))}
          >
            {label} ›{" "}
          </Button>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: crumb position is its identity
          <Typography.Text key={depth} strong>
            {label}
          </Typography.Text>
        ),
      )}
    </div>
  );

  // Layout containers (tabs/card/grid/...) are nameless and value-transparent: show a
  // minimal, settings-only editor. Drag-based authoring of their children is Phase E.
  if (isLayoutContainer(node)) {
    return (
      <div style={{ padding: 16, overflow: "auto", height: "100%" }}>
        {breadcrumb}
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          {fieldTypeLabel(node.type)} container — its fields are edited on the canvas.
        </Typography.Paragraph>
        <Form layout="vertical" size="small">
          <TypeSettings field={node} set={set} />
        </Form>
      </div>
    );
  }

  // Visibility candidates: sibling fields in the same container as the edited node.
  const parent = path.length ? nodeAtPath(root, path.slice(0, -1)) : null;
  const siblingNames = path.length
    ? (parent ? (childrenOf(parent) ?? []) : [])
        .map((f) => nodeName(f))
        .filter((n): n is string => Boolean(n) && n !== nodeName(node))
    : topSiblingNames.filter((n) => n !== nodeName(node));

  return (
    <div style={{ padding: 16, overflow: "auto", height: "100%" }}>
      {breadcrumb}
      <FieldForm
        field={node as AuthoredField}
        siblingNames={siblingNames}
        set={set}
        onDrill={(index) => setDrillPath([...path, index])}
        nested={path.length > 0}
      />
    </div>
  );
}

/** The full property editor for a single field. Reused recursively: a top-level field
 *  and a nested array item field both render through this. */
function FieldForm({
  field,
  siblingNames,
  set,
  onDrill,
  nested,
}: {
  field: AuthoredField;
  siblingNames: string[];
  set: (patch: Patch) => void;
  onDrill: (index: number) => void;
  /** True when editing an array item field. Per-row `visibleWhen` isn't supported by
   *  the engine yet (item schema is built against empty values), so the Visibility
   *  section is hidden for nested items to avoid authoring a misleading condition. */
  nested?: boolean;
}) {
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
  const condFields = siblingNames.filter((n) => n !== field.name);

  return (
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
        {field.type !== "array" && (
          <Form.Item>
            <Checkbox
              checked={!!field.disabled}
              onChange={(e) => set({ disabled: e.target.checked || undefined } as Patch)}
            >
              Disabled
            </Checkbox>
          </Form.Item>
        )}
      </Space>

      {/* Type-specific properties, driven by the registry descriptor */}
      <TypeSettings field={field} set={set} />
      {field.type === "array" && <ItemFieldsEditor field={field} set={set} onConfigure={onDrill} />}
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

      {/* Per-row visibility isn't supported by the engine yet, so this is hidden for
          array item fields (see the `nested` prop note). */}
      {!nested && (
        <>
          <Divider orientation="left" plain>
            Visibility
          </Divider>
          <Form.Item label="Show this field">
            <Select
              value={equals ? "when" : "always"}
              onChange={(mode) => {
                if (mode === "always") set({ visibleWhen: undefined });
                else {
                  const first = condFields[0] ?? "";
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
                  options={condFields.map((n) => ({ label: n, value: n }))}
                />
              </Form.Item>
              <Form.Item label="Equals">
                <Input
                  value={equals.value}
                  onChange={(e) =>
                    set({
                      visibleWhen: { rule: { "==": [{ var: equals.field }, e.target.value] } },
                    })
                  }
                />
              </Form.Item>
            </Space>
          )}
        </>
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
  );
}

/** Read a dynamic property off a node without widening its type to `any`. */
function prop(field: FieldNode, key: string): unknown {
  return (field as Record<string, unknown>)[key];
}

/** Renders the type-specific settings declared by the field's registry descriptor.
 *  Adding a new type/setting needs only a registry entry — no edit here. */
function TypeSettings({ field, set }: { field: FieldNode; set: (patch: Patch) => void }) {
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
          case "select":
            return (
              <Form.Item key={s.key} label={s.label}>
                <Select
                  style={{ width: "100%" }}
                  allowClear
                  value={(prop(field, s.key) as string) ?? undefined}
                  options={s.choices ?? []}
                  onChange={(v) => setKey(v ?? undefined)}
                />
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
function DefaultValueEditor({ field, set }: { field: AuthoredField; set: (patch: Patch) => void }) {
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
function ValidationEditor({ field, set }: { field: AuthoredField; set: (patch: Patch) => void }) {
  const { validations: allowed } = describeField(field.type);
  if (!allowed || allowed.length === 0) return null;
  // `validations` lives on leaf fields only; read it dynamically so the array node
  // (which has no validations and is filtered out above) doesn't widen the type.
  const rules = (prop(field, "validations") as ValidationRule[] | undefined) ?? [];
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

/** Item-field types offered inside an array row: every palette-visible leaf type (the
 *  `array` container itself is excluded — no nested arrays in this minimal editor). */
const ITEM_TYPES: FieldType[] = PALETTE_TYPES.filter((t) => t !== "array");

/** A compact, non-DnD editor for an array node's repeated `itemFields`. Authors the
 *  row "columns" (type/label/name + reorder/remove) and picks the display variant.
 *  "Configure" drills into an item to edit it with the full property panel. */
function ItemFieldsEditor({
  field,
  set,
  onConfigure,
}: {
  field: ArrayField;
  set: (patch: Patch) => void;
  /** Open the full editor for the item field at `index` (PropertyPanel drill-in). */
  onConfigure: (index: number) => void;
}) {
  const items = field.itemFields;
  const commit = (next: FieldNode[]) => set({ itemFields: next } as Patch);
  const update = (i: number, next: FieldNode) =>
    commit(items.map((it, idx) => (idx === i ? next : it)));
  const remove = (i: number) => commit(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const namesExcept = (i: number) =>
    new Set(
      items
        .filter((_, idx) => idx !== i)
        .map((f) => nodeName(f))
        .filter((n): n is string => Boolean(n)),
    );
  const add = () => commit([...items, newField("text", namesExcept(-1))]);
  // Change an item's type, keeping its name/label/required and reseeding the rest.
  const changeType = (i: number, type: FieldType) => {
    const it = items[i];
    // ITEM_TYPES only offers named leaf types, so the seed always has a name/label.
    const seeded = newField(type, namesExcept(i));
    update(i, {
      ...seeded,
      name: nodeName(it) ?? nodeName(seeded),
      label: nodeLabel(it) ?? nodeLabel(seeded),
      required: (prop(it, "required") as boolean | undefined) || undefined,
    } as FieldNode);
  };

  return (
    <>
      <Divider orientation="left" plain>
        Item fields
      </Divider>
      <Form.Item label="Display">
        <Segmented
          value={field.variant ?? "card"}
          onChange={(v) => set({ variant: v as ArrayField["variant"] } as Patch)}
          options={[
            { label: "Cards", value: "card" },
            { label: "Table", value: "table" },
          ]}
        />
      </Form.Item>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Columns repeated for each row. Use Configure for full settings (options, validation, default
        value…).
      </Typography.Text>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
        {items.map((it, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: item fields have no stable id; index is fine for this small editor
          <Space key={i} wrap align="start">
            <Select
              style={{ width: 110 }}
              // A loaded item could be a `group` (not authorable here); it shows blank.
              value={it.type as FieldType}
              options={ITEM_TYPES.map((t) => ({ label: fieldTypeLabel(t), value: t }))}
              onChange={(t: FieldType) => changeType(i, t)}
            />
            <Input
              style={{ width: 100 }}
              placeholder="label"
              value={nodeLabel(it) ?? ""}
              onChange={(e) => update(i, { ...it, label: e.target.value } as FieldNode)}
            />
            <Input
              style={{ width: 90 }}
              placeholder="name"
              value={nodeName(it) ?? ""}
              onChange={(e) => update(i, { ...it, name: e.target.value } as FieldNode)}
            />
            <Button size="small" onClick={() => onConfigure(i)}>
              Configure
            </Button>
            <Button type="text" size="small" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </Button>
            <Button
              type="text"
              size="small"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </Button>
            <Button type="text" size="small" danger onClick={() => remove(i)}>
              ✕
            </Button>
          </Space>
        ))}
        <Button size="small" onClick={add}>
          Add item field
        </Button>
      </div>
    </>
  );
}

/** Merge a permissions patch, dropping the object entirely when it becomes empty. */
function mergePermissions(
  field: AuthoredField,
  patch: { viewRoles?: string[]; editRoles?: string[] },
): AuthoredField["permissions"] {
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
