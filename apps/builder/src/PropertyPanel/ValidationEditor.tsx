import type { AsyncValidator, ValidationRule } from "@org/form-schema";
import {
  Button,
  Divider,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Typography,
} from "antd";
import { describeField, type ValidationRuleType } from "../field-registry";
import { prop } from "./helpers";
import { CROSS_OPS, type CrossOp, type CrossRight, coerceLiteral, readSimpleRule } from "./rules";
import type { AuthoredField, Patch } from "./types";

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
  { label: "Integer", value: "integer" },
  { label: "Number", value: "number" },
  { label: "Money", value: "money" },
  { label: "ID card", value: "idcard" },
  { label: "Chinese", value: "zh" },
  { label: "Letters", value: "en" },
  { label: "QQ", value: "qq" },
  { label: "Postal code", value: "zip" },
];

/** A "Validation" section whose available rule kinds come from the registry
 *  descriptor. Each rule edits a `{ type, value?, format?, message?, severity?, rule? }`
 *  entry that form-core compiles to Zod (or evaluates as a warning / cross assertion).
 *  Every leaf additionally gets the "Remote check" (asyncValidator) block, even when
 *  it declares no rule kinds. */
export function ValidationEditor({
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
                  style={{ width: 130 }}
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
