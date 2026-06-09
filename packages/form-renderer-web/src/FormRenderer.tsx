import { zodResolver } from "@hookform/resolvers/zod";
import {
  type AccessContext,
  buildZodSchema,
  canEdit,
  canView,
  type DataSourceOption,
  fetchDataSourceOptions,
  isVisible,
} from "@org/form-core";
import { type FieldNode, type FormSchema, type LeafField, migrate } from "@org/form-schema";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Col,
  ColorPicker,
  ConfigProvider,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Rate,
  Row,
  Select,
  Slider,
  Switch,
  type ThemeConfig,
  TimePicker,
} from "antd";
import type React from "react";
import { useMemo, useState } from "react";
import { Controller, type Resolver, useForm } from "react-hook-form";

const DEFAULT_SPAN = { xs: 24, sm: 24, md: 12, lg: 12 };

type DateValue = React.ComponentProps<typeof DatePicker>["value"];
type TimeValue = React.ComponentProps<typeof TimePicker>["value"];
type SelectValue = string | number | Array<string | number> | undefined;
type SelectField = Extract<LeafField, { type: "select" }>;

/** A select whose options may come from a remote dataSource via react-query.
 *  Fetching + option mapping live in form-core so native reuses them; only the
 *  antd control + react-query wiring + loading/error UI are web-specific. */
function SelectControl(props: {
  node: SelectField;
  value: SelectValue;
  disabled?: boolean;
  onChange: (v: unknown) => void;
  /** Current value of the `dataSource.dependsOn` parent field, if any. */
  dependsOnValue?: unknown;
}) {
  const { node, value, disabled, onChange, dependsOnValue } = props;
  const ds = node.dataSource;

  // A dependent select waits until its parent has a value before fetching.
  const waitingOnParent = !!ds?.dependsOn && (dependsOnValue == null || dependsOnValue === "");

  const query = useQuery<DataSourceOption[]>({
    queryKey: ["form-datasource", ds?.url, ds?.dependsOn ? dependsOnValue : null],
    enabled: !!ds && !waitingOnParent,
    // ds is defined whenever the query is enabled.
    queryFn: () => fetchDataSourceOptions(ds as NonNullable<typeof ds>, dependsOnValue),
  });

  // Static options pass straight through; remote options come from the query.
  const options = ds ? (query.data ?? []) : node.options;

  let notFoundContent: React.ReactNode;
  if (waitingOnParent) notFoundContent = `Select ${ds?.dependsOn} first`;
  else if (query.isError) notFoundContent = (query.error as Error).message;

  return (
    <Select
      style={{ width: "100%" }}
      value={value}
      disabled={disabled}
      mode={node.multiple ? "multiple" : undefined}
      options={options}
      loading={!!ds && query.isFetching}
      status={query.isError ? "error" : undefined}
      notFoundContent={notFoundContent}
      onChange={onChange}
    />
  );
}

function FieldControl(props: {
  node: LeafField;
  value: unknown;
  disabled?: boolean;
  onChange: (v: unknown) => void;
  /** Current value of a select's `dataSource.dependsOn` parent field, if any. */
  dependsOnValue?: unknown;
}) {
  const { node, value, disabled, onChange, dependsOnValue } = props;
  switch (node.type) {
    case "text":
      return (
        <Input
          value={(value as string) ?? ""}
          disabled={disabled}
          maxLength={node.maxLength}
          placeholder={node.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "textarea":
      return (
        <Input.TextArea
          value={(value as string) ?? ""}
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
          value={(value as number | null) ?? null}
          disabled={disabled}
          min={node.min}
          max={node.max}
          onChange={onChange}
        />
      );
    case "password":
      return (
        <Input.Password
          value={(value as string) ?? ""}
          disabled={disabled}
          maxLength={node.maxLength}
          placeholder={node.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "select":
      return (
        <SelectControl
          node={node}
          value={value as SelectValue}
          disabled={disabled}
          onChange={onChange}
          dependsOnValue={dependsOnValue}
        />
      );
    case "radio":
      return (
        <Radio.Group
          value={value}
          disabled={disabled}
          options={node.options ?? []}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "slider":
      return (
        <Slider
          value={(value as number) ?? node.min ?? 0}
          disabled={disabled}
          min={node.min}
          max={node.max}
          step={node.step}
          onChange={onChange}
        />
      );
    case "rate":
      return (
        <Rate
          value={(value as number) ?? 0}
          disabled={disabled}
          count={node.count ?? 5}
          allowHalf={node.allowHalf}
          onChange={onChange}
        />
      );
    case "color":
      return (
        <ColorPicker
          value={(value as string) ?? undefined}
          disabled={disabled}
          onChange={(_, hex) => onChange(hex)}
        />
      );
    case "date":
      return (
        <DatePicker
          style={{ width: "100%" }}
          value={(value as DateValue) ?? null}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "time":
      return (
        <TimePicker
          style={{ width: "100%" }}
          value={(value as TimeValue) ?? null}
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
    case "switch":
      return <Switch checked={!!value} disabled={disabled} onChange={onChange} />;
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

/** Collect per-field `defaultValue`s declared in the schema. Explicit
 *  `initialValues` (e.g. an existing submission) always win over these. */
function schemaDefaults(nodes: FieldNode[], into: Values = {}): Values {
  for (const node of nodes) {
    if (node.type === "group") {
      schemaDefaults(node.children, into);
    } else if (node.defaultValue !== undefined) {
      into[node.name] = node.defaultValue;
    }
  }
  return into;
}

export function FormRenderer({
  schema,
  theme,
  access = { roles: [] },
  initialValues,
  onSubmit,
  submitLabel = "Submit",
}: FormRendererProps) {
  const form: FormSchema = useMemo(() => migrate(schema), [schema]);

  // Self-contained QueryClient so consumers don't have to provide one. Retries
  // are off so dataSource error states surface immediately. Created once.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );

  // Validation rebuilds per call so visibility (and RBAC) reflect current values:
  // hidden fields are excluded from validation and stripped from the output.
  const resolver: Resolver<Values> = (values, context, options) =>
    (zodResolver(buildZodSchema(form, { values, access })) as Resolver<Values>)(
      values,
      context,
      options,
    );

  const defaultValues = useMemo<Values>(
    () => ({ ...schemaDefaults(form.fields), ...initialValues }),
    [form, initialValues],
  );

  const { control, handleSubmit, watch } = useForm<Values>({
    defaultValues,
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
    const editable = canEdit(node, access) && node.disabled !== true;
    // A select with a dependent dataSource reads its parent field's current value.
    const dependsOn = node.type === "select" ? node.dataSource?.dependsOn : undefined;
    const dependsOnValue = dependsOn ? values[dependsOn] : undefined;
    return (
      <Col key={node.name} {...span}>
        <Controller
          name={node.name}
          control={control}
          render={({ field, fieldState }) => (
            <Form.Item
              label={node.label}
              tooltip={node.tooltip}
              required={node.required}
              validateStatus={fieldState.error ? "error" : undefined}
              help={fieldState.error?.message ?? node.helpText}
            >
              <FieldControl
                node={node}
                value={field.value}
                disabled={!editable}
                onChange={field.onChange}
                dependsOnValue={dependsOnValue}
              />
            </Form.Item>
          )}
        />
      </Col>
    );
  };

  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
