import {
  type ArrayField,
  type AsyncValidator,
  childrenOf,
  type FieldNode,
  type FormLayoutProps,
  isLayoutContainer,
  type LeafField,
  type Reaction,
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
import { DataSourceEditor, isOptionSourced } from "./DataSourceEditor";
import { type NodePath, nodeAtPath, patchNodeAtPath } from "./engine/field-path";
import type { FormProps } from "./engine/tree";
import {
  describeField,
  describeNode,
  type FieldType,
  FORM_META,
  fieldTypeLabel,
  newField,
  PALETTE_TYPES,
  type SettingDescriptor,
  type ValidationRuleType,
} from "./field-registry";
import { ReactionsEditor } from "./ReactionsEditor";

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
  cross: "Cross-field (logic)",
};
const SEVERITY_OPTIONS = [
  { label: "Error", value: "error" },
  { label: "Warning", value: "warning" },
];
const FORMAT_OPTIONS = [
  { label: "Email", value: "email" },
  { label: "URL", value: "url" },
  { label: "Phone", value: "phone" },
];

/** A breakpoint colSpan; antd Col span is 1..24. */
type ColKey = "xs" | "sm" | "md" | "lg";
const COL_KEYS: ColKey[] = ["xs", "sm", "md", "lg"];

type Patch = Partial<AuthoredField>;

/** Read the `{ field, value }` of a simple `{ "==": [{var}, value] }` JSONLogic rule,
 *  if it has that exact shape. Anything more complex returns null so the UI can fall
 *  back to a "edit via JSON" hint. Shared by the Visibility editor and ReactionsEditor. */
export function readEqualsRule(rule: unknown): { field: string; value: string } | null {
  const eq = (rule as { "=="?: unknown } | undefined)?.["=="];
  if (!Array.isArray(eq) || eq.length !== 2) return null;
  const left = eq[0] as { var?: string } | undefined;
  if (!left || typeof left.var !== "string") return null;
  return { field: left.var, value: String(eq[1] ?? "") };
}

/** Read the simple-equals shape of a field's `visibleWhen`, if any. */
function readEquals(field: AuthoredField): { field: string; value: string } | null {
  return readEqualsRule(field.visibleWhen?.rule);
}

/** Comparators the simple cross-rule builder offers (json-logic operators). */
export const CROSS_OPS = ["==", "!=", ">", ">=", "<", "<="] as const;
export type CrossOp = (typeof CROSS_OPS)[number];
export type CrossRight = { kind: "field"; name: string } | { kind: "value"; value: string };

/** Read a simple `{op: [{var: left}, {var: right} | literal]}` JSONLogic rule, the
 *  shape the cross-rule builder writes. Anything more complex returns null so the UI
 *  falls back to a "edit via JSON" hint (same contract as readEqualsRule). */
export function readSimpleRule(
  rule: unknown,
): { op: CrossOp; left: string; right: CrossRight } | null {
  if (rule == null || typeof rule !== "object") return null;
  const keys = Object.keys(rule);
  if (keys.length !== 1) return null;
  const op = keys[0] as CrossOp;
  if (!CROSS_OPS.includes(op)) return null;
  const args = (rule as Record<string, unknown>)[op];
  if (!Array.isArray(args) || args.length !== 2) return null;
  const left = args[0] as { var?: unknown } | null;
  if (left == null || typeof left !== "object" || typeof left.var !== "string") return null;
  const rightRaw = args[1];
  if (rightRaw != null && typeof rightRaw === "object") {
    const rv = (rightRaw as { var?: unknown }).var;
    if (typeof rv !== "string") return null;
    return { op, left: left.var, right: { kind: "field", name: rv } };
  }
  return { op, left: left.var, right: { kind: "value", value: String(rightRaw ?? "") } };
}

/** Store numeric-looking literals as numbers so json-logic's ordering operators
 *  compare numerically. */
function coerceLiteral(text: string): string | number {
  return text !== "" && !Number.isNaN(Number(text)) ? Number(text) : text;
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
  form,
  siblingNames: topSiblingNames,
  fieldNames,
  onChange,
  onChangeForm,
}: {
  selected: SelectedNode | null;
  /** The root Form node, set when IT is the selection (mutually exclusive with `selected`). */
  form?: FormProps | null;
  /** Top-level field names, candidates for a visibleWhen condition. */
  siblingNames: string[];
  /** Every named field reachable in the top-level value scope (containers descended,
   *  array subtrees skipped) — reaction TARGET candidates for a top-level field. */
  fieldNames: string[];
  /** Emits the rebuilt top-level node (App swaps it into the tree via replaceField). */
  onChange: (uid: string, field: FieldNode) => void;
  /** Patches the root Form node (id/title/layoutProps). */
  onChangeForm?: (patch: Partial<FormProps>) => void;
}) {
  const [drillPath, setDrillPath] = useState<NodePath>([]);
  // Leaving the current node resets the drill; a stale path (e.g. after undo) too.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the selected node changes
  useEffect(() => setDrillPath([]), [selected?.uid]);

  if (!selected) {
    if (form && onChangeForm) {
      return <FormSettingsEditor form={form} onChange={onChangeForm} />;
    }
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
          {/* A named container (today only `group`) carries a schema key once it is
              authorable/selectable on the canvas. */}
          {describeNode(node.type).named && (
            <Form.Item label="Name (schema key)">
              <Input value={nodeName(node) ?? ""} onChange={(e) => set({ name: e.target.value })} />
            </Form.Item>
          )}
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
        // Reaction targets: all top-level-scope names for a top-level field; the row's
        // sibling names when editing an array item field (path.length > 0).
        targetNames={path.length ? siblingNames : fieldNames}
        set={set}
        onDrill={(index) => setDrillPath([...path, index])}
      />
    </div>
  );
}

/** The full property editor for a single field. Reused recursively: a top-level field
 *  and a nested array item field both render through this. */
function FieldForm({
  field,
  siblingNames,
  targetNames,
  set,
  onDrill,
}: {
  field: AuthoredField;
  siblingNames: string[];
  /** Candidate reaction target names (top-level scope names, or row siblings when nested). */
  targetNames: string[];
  set: (patch: Patch) => void;
  onDrill: (index: number) => void;
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
      <Space wrap>
        <Form.Item>
          <Checkbox
            checked={!!field.required}
            onChange={(e) => set({ required: e.target.checked || undefined })}
          >
            Required
          </Checkbox>
        </Form.Item>
        {/* Universal interaction pattern (Formily-style), layered on the additive
            disabled/readOnly/readPretty flags — mutually exclusive in the UI. */}
        {field.type !== "array" && (
          <Form.Item label="Pattern">
            <Select
              style={{ width: 140 }}
              value={
                field.readPretty
                  ? "readPretty"
                  : field.readOnly
                    ? "readOnly"
                    : field.disabled
                      ? "disabled"
                      : "editable"
              }
              options={[
                { label: "Editable", value: "editable" },
                { label: "Disabled", value: "disabled" },
                { label: "Read-only", value: "readOnly" },
                { label: "Read-pretty", value: "readPretty" },
              ]}
              onChange={(p) =>
                set({
                  disabled: p === "disabled" ? true : undefined,
                  readOnly: p === "readOnly" ? true : undefined,
                  readPretty: p === "readPretty" ? true : undefined,
                } as Patch)
              }
            />
          </Form.Item>
        )}
      </Space>

      {/* Type-specific properties, driven by the registry descriptor */}
      <TypeSettings field={field} set={set} />
      {/* An option-sourced leaf's options (select / checkbox-group / cascader /
          tree-select) come from the shared static-vs-remote editor (params + cache). */}
      {isOptionSourced(field) && (
        <DataSourceEditor field={field} sourceNames={condFields} set={set} />
      )}
      {field.type === "array" && <ItemFieldsEditor field={field} set={set} onConfigure={onDrill} />}
      <DefaultValueEditor field={field} set={set} />

      <ValidationEditor field={field} siblingNames={condFields} set={set} />

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

      {/* Visibility is editable for top-level AND array item fields: per-row visibleWhen
          is evaluated against the row's merged scope (G4). For an item field, `condFields`
          offers the row's sibling names; referencing a top-level field still works via the
          JSON panel since the row scope merges outer values. */}
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

      <ReactionsEditor
        reactions={(prop(field, "reactions") as Reaction[] | undefined) ?? []}
        fieldName={field.name}
        targetNames={targetNames}
        sourceNames={condFields}
        onChange={(next) => set({ reactions: next.length ? next : undefined } as Patch)}
      />

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
function SettingControls({
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

/** The root Form's settings editor: identity (id/title) + the FORM_META layout
 *  descriptors mapped onto `form.layoutProps`, plus labelCol/wrapperCol spans.
 *  Entirely descriptor-driven — new form settings need only a FORM_SETTINGS entry. */
function FormSettingsEditor({
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
      </Form>
    </div>
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
 *  descriptor. Each rule edits a `{ type, value?, format?, message?, severity?, rule? }`
 *  entry that form-core compiles to Zod (or evaluates as a warning / cross assertion).
 *  Every leaf additionally gets the "Remote check" (asyncValidator) block, even when
 *  it declares no rule kinds. */
function ValidationEditor({
  field,
  siblingNames,
  set,
}: {
  field: AuthoredField;
  /** Other field names a cross rule can reference. */
  siblingNames: string[];
  set: (patch: Patch) => void;
}) {
  if (field.type === "array") return null;
  const allowed = describeField(field.type).validations ?? [];
  // `validations`/`asyncValidator` live on leaf fields only; read them dynamically so
  // the array node (filtered out above) doesn't widen the type.
  const rules = (prop(field, "validations") as ValidationRule[] | undefined) ?? [];
  const av = prop(field, "asyncValidator") as AsyncValidator | undefined;
  const commit = (next: ValidationRule[]) =>
    set({ validations: next.length ? next : undefined } as Patch);
  // An undefined patch value DELETES the key (e.g. severity back to its "error"
  // default, or value/format/rule resets on a type change) so it never serializes.
  const update = (i: number, patch: Partial<ValidationRule>) =>
    commit(
      rules.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch } as Record<string, unknown>;
        for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
        return next as ValidationRule;
      }),
    );
  const remove = (i: number) => commit(rules.filter((_, idx) => idx !== i));
  const add = () => commit([...rules, { type: allowed[0] ?? "required" }]);
  const setAv = (patch: Partial<AsyncValidator>) => {
    const next = { url: "", ...av, ...patch };
    set({ asyncValidator: next.url ? next : undefined } as Patch);
  };

  const ruleOptions = allowed.map((t) => ({ label: RULE_LABELS[t], value: t }));
  const crossFields = [field.name, ...siblingNames];
  const fieldOptions = crossFields.map((n) => ({ label: n, value: n }));

  return (
    <>
      <Divider orientation="left" plain>
        Validation
      </Divider>
      {allowed.length > 0 && (
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
                    // A fresh cross rule compares this field to its first sibling.
                    rule:
                      type === "cross"
                        ? { "==": [{ var: field.name }, { var: siblingNames[0] ?? field.name }] }
                        : undefined,
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
              {rule.type === "cross" && (
                <CrossRuleControls
                  rule={rule.rule}
                  fieldOptions={fieldOptions}
                  onChange={(next) => update(i, { rule: next })}
                />
              )}
              <Input
                style={{ width: 140 }}
                placeholder="message (optional)"
                value={rule.message ?? ""}
                onChange={(e) => update(i, { message: e.target.value || undefined })}
              />
              <Select
                style={{ width: 100 }}
                value={rule.severity ?? "error"}
                options={SEVERITY_OPTIONS}
                onChange={(severity: "error" | "warning") =>
                  // "error" is the default — serialize it away.
                  update(i, { severity: severity === "error" ? undefined : severity })
                }
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
      )}

      <Form.Item
        label="Remote check (URL)"
        tooltip="GET url?value=<value>&name=<field> → { valid, message? }. valid:false blocks submit; network failure never blocks."
        style={{ marginTop: 12 }}
      >
        <Input
          placeholder="/api/check-username"
          value={av?.url ?? ""}
          onChange={(e) => setAv({ url: e.target.value })}
        />
      </Form.Item>
      {av && (
        <Space>
          <Form.Item label="Message">
            <Input
              style={{ width: 160 }}
              placeholder="server message wins"
              value={av.message ?? ""}
              onChange={(e) => setAv({ message: e.target.value || undefined })}
            />
          </Form.Item>
          <Form.Item label="Debounce (ms)">
            <InputNumber
              style={{ width: 110 }}
              min={0}
              placeholder="400"
              value={av.debounceMs ?? null}
              onChange={(v) => setAv({ debounceMs: v ?? undefined })}
            />
          </Form.Item>
        </Space>
      )}
    </>
  );
}

/** The simple comparator builder for a `cross` rule: left field, operator, and a
 *  right side that toggles between another field and a literal value. A rule too
 *  complex for this shape shows the JSON-panel hint instead (readSimpleRule contract). */
function CrossRuleControls({
  rule,
  fieldOptions,
  onChange,
}: {
  rule: ValidationRule["rule"];
  fieldOptions: Array<{ label: string; value: string }>;
  onChange: (rule: Record<string, unknown>) => void;
}) {
  const simple = readSimpleRule(rule);
  if (!simple) {
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Complex rule — edit via the JSON panel
      </Typography.Text>
    );
  }
  const write = (op: CrossOp, left: string, right: CrossRight) =>
    onChange({
      [op]: [
        { var: left },
        right.kind === "field" ? { var: right.name } : coerceLiteral(right.value),
      ],
    });
  return (
    <Space wrap align="start">
      <Select
        style={{ width: 110 }}
        value={simple.left}
        options={fieldOptions}
        onChange={(left) => write(simple.op, left, simple.right)}
      />
      <Select
        style={{ width: 70 }}
        value={simple.op}
        options={CROSS_OPS.map((o) => ({ label: o, value: o }))}
        onChange={(op: CrossOp) => write(op, simple.left, simple.right)}
      />
      <Segmented
        size="small"
        value={simple.right.kind}
        options={[
          { label: "Field", value: "field" },
          { label: "Value", value: "value" },
        ]}
        onChange={(kind) =>
          write(
            simple.op,
            simple.left,
            kind === "field"
              ? { kind: "field", name: fieldOptions[0]?.value ?? simple.left }
              : { kind: "value", value: "" },
          )
        }
      />
      {simple.right.kind === "field" ? (
        <Select
          style={{ width: 110 }}
          value={simple.right.name}
          options={fieldOptions}
          onChange={(name) => write(simple.op, simple.left, { kind: "field", name })}
        />
      ) : (
        <Input
          style={{ width: 90 }}
          placeholder="value"
          value={simple.right.value}
          onChange={(e) => write(simple.op, simple.left, { kind: "value", value: e.target.value })}
        />
      )}
    </Space>
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
      {field.variant === "table" ? (
        <Form.Item>
          <Checkbox
            checked={field.editInDialog ?? false}
            onChange={(e) => set({ editInDialog: e.target.checked || undefined } as Patch)}
          >
            Edit rows in a dialog
          </Checkbox>
        </Form.Item>
      ) : null}
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

export type Option = { label: string; value: string | number };

export function OptionsEditor({
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
