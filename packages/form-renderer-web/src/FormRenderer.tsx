import { type AccessContext, canEdit, canView, isVisible } from "@org/form-core";
import { type FieldNode, type FormSchema, migrate } from "@org/form-schema";
import {
  Checkbox,
  Col,
  ConfigProvider,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  type ThemeConfig,
} from "antd";
import type React from "react";
import { useMemo, useState } from "react";

const DEFAULT_SPAN = { xs: 24, sm: 24, md: 12, lg: 12 };

function FieldControl(props: {
  node: any;
  value: any;
  disabled?: boolean;
  onChange: (v: any) => void;
}) {
  const { node, value, disabled, onChange } = props;
  switch (node.type) {
    case "text":
      return (
        <Input
          value={value}
          disabled={disabled}
          maxLength={node.maxLength}
          placeholder={node.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <InputNumber
          style={{ width: "100%" }}
          value={value}
          disabled={disabled}
          min={node.min}
          max={node.max}
          onChange={onChange}
        />
      );
    case "select":
      return (
        <Select
          style={{ width: "100%" }}
          value={value}
          disabled={disabled}
          mode={node.multiple ? "multiple" : undefined}
          options={node.options}
          onChange={onChange}
        />
      );
    case "date":
      return <DatePicker style={{ width: "100%" }} disabled={disabled} onChange={onChange} />;
    case "checkbox":
      return (
        <Checkbox
          checked={!!value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    default:
      return null;
  }
}

export interface FormRendererProps {
  /** Raw JSON of any saved version. Migrated to the current shape internally. */
  schema: unknown;
  /** antd token theme produced by the Theme Editor. */
  theme?: ThemeConfig;
  access?: AccessContext;
  /** Seed values, e.g. when editing an existing submission. Drives conditional visibility. */
  initialValues?: Record<string, unknown>;
  onSubmit?: (values: Record<string, unknown>) => void;
}

export function FormRenderer({
  schema,
  theme,
  access = { roles: [] },
  initialValues,
  onSubmit,
}: FormRendererProps) {
  const form: FormSchema = useMemo(() => migrate(schema), [schema]);
  const [values, setValues] = useState<Record<string, unknown>>(initialValues ?? {});
  const setValue = (name: string, v: unknown) => setValues((s) => ({ ...s, [name]: v }));

  const renderNode = (node: FieldNode): React.ReactNode => {
    if (!isVisible(node, values)) return null; // shared conditional logic
    if (!canView(node, access)) return null; // shared RBAC

    if (node.type === "group") {
      return (
        <Col key={node.name} span={24}>
          <fieldset style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: 16 }}>
            {node.label ? <legend style={{ padding: "0 8px" }}>{node.label}</legend> : null}
            <Row gutter={16}>{node.children.map(renderNode)}</Row>
          </fieldset>
        </Col>
      );
    }

    // Responsive: read per-breakpoint colSpan; antd collapses to xs on small screens.
    const span = { ...DEFAULT_SPAN, ...(node.layout?.colSpan ?? {}) };
    const editable = canEdit(node, access);
    return (
      <Col key={node.name} {...span}>
        <Form.Item label={node.label} required={node.required} help={node.helpText}>
          <FieldControl
            node={node}
            value={values[node.name]}
            disabled={!editable}
            onChange={(v) => setValue(node.name, v)}
          />
        </Form.Item>
      </Col>
    );
  };

  return (
    <ConfigProvider theme={theme}>
      <Form layout="vertical" onFinish={() => onSubmit?.(values)}>
        <Row gutter={16}>{form.fields.map(renderNode)}</Row>
      </Form>
    </ConfigProvider>
  );
}
