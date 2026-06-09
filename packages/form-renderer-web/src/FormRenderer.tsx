import { zodResolver } from "@hookform/resolvers/zod";
import { type AccessContext, buildZodSchema, canEdit, canView, isVisible } from "@org/form-core";
import { type FieldNode, type FormSchema, migrate } from "@org/form-schema";
import {
  Button,
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
import { useMemo } from "react";
import { Controller, type Resolver, useForm } from "react-hook-form";

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
          value={value ?? ""}
          disabled={disabled}
          maxLength={node.maxLength}
          placeholder={node.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "textarea":
      return (
        <Input.TextArea
          value={value ?? ""}
          disabled={disabled}
          maxLength={node.maxLength}
          rows={node.rows}
          placeholder={node.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <InputNumber
          style={{ width: "100%" }}
          value={value ?? null}
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
      return (
        <DatePicker
          style={{ width: "100%" }}
          value={value ?? null}
          disabled={disabled}
          onChange={onChange}
        />
      );
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
  /** Receives a clean, typed values object — only visible/permitted fields. */
  onSubmit?: (values: Record<string, unknown>) => void;
  submitLabel?: string;
}

type Values = Record<string, unknown>;

export function FormRenderer({
  schema,
  theme,
  access = { roles: [] },
  initialValues,
  onSubmit,
  submitLabel = "Submit",
}: FormRendererProps) {
  const form: FormSchema = useMemo(() => migrate(schema), [schema]);

  // Validation rebuilds per call so visibility (and RBAC) reflect current values:
  // hidden fields are excluded from validation and stripped from the output.
  const resolver: Resolver<Values> = (values, context, options) =>
    (zodResolver(buildZodSchema(form, { values, access })) as Resolver<Values>)(
      values,
      context,
      options,
    );

  const { control, handleSubmit, watch } = useForm<Values>({
    defaultValues: initialValues ?? {},
    resolver,
  });
  const values = watch();

  const submit = handleSubmit((data) => {
    // Parse once more to strip hidden/non-viewable keys -> a clean typed payload.
    const clean = buildZodSchema(form, { values: data, access }).parse(data);
    onSubmit?.(clean);
  });

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
        <Controller
          name={node.name}
          control={control}
          render={({ field, fieldState }) => (
            <Form.Item
              label={node.label}
              required={node.required}
              validateStatus={fieldState.error ? "error" : undefined}
              help={fieldState.error?.message ?? node.helpText}
            >
              <FieldControl
                node={node}
                value={field.value}
                disabled={!editable}
                onChange={field.onChange}
              />
            </Form.Item>
          )}
        />
      </Col>
    );
  };

  return (
    <ConfigProvider theme={theme}>
      <Form layout="vertical" component={false}>
        <form onSubmit={submit} noValidate>
          <Row gutter={16}>{form.fields.map(renderNode)}</Row>
          <Button type="primary" htmlType="submit">
            {submitLabel}
          </Button>
        </form>
      </Form>
    </ConfigProvider>
  );
}
