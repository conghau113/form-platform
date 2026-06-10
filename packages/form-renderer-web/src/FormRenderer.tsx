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
import {
  type ArrayField,
  type FieldNode,
  type FormSchema,
  isLayoutContainer,
  type LeafField,
  migrate,
} from "@org/form-schema";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
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
  Space,
  Switch,
  Table,
  Tabs,
  type ThemeConfig,
  TimePicker,
} from "antd";
import type React from "react";
import { Fragment, useMemo, useState } from "react";
import { type Control, Controller, type Resolver, useFieldArray, useForm } from "react-hook-form";

const DEFAULT_SPAN = { xs: 24, sm: 24, md: 12, lg: 12 };

/** antd Col sizing — either a fixed `span` or per-breakpoint widths. */
type ColSpanProps = {
  span?: number;
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
};

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
  id?: string;
}) {
  const { node, value, disabled, onChange, dependsOnValue, id } = props;
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
      id={id}
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
  /** DOM id linking the control to its Form.Item label (htmlFor). */
  id?: string;
}) {
  const { node, value, disabled, onChange, dependsOnValue, id } = props;
  switch (node.type) {
    case "text":
      return (
        <Input
          id={id}
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
          id={id}
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
          id={id}
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
          id={id}
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
          id={id}
        />
      );
    case "radio":
      return (
        <Radio.Group
          id={id}
          value={value}
          disabled={disabled}
          options={node.options ?? []}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "slider":
      return (
        <Slider
          id={id}
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
          id={id}
          value={(value as number) ?? 0}
          disabled={disabled}
          count={node.count ?? 5}
          allowHalf={node.allowHalf}
          onChange={onChange}
        />
      );
    case "color":
      return (
        // antd ColorPicker exposes no `id` prop; its label stays unassociated.
        <ColorPicker
          value={(value as string) ?? undefined}
          disabled={disabled}
          onChange={(_, hex) => onChange(hex)}
        />
      );
    case "date":
      return (
        <DatePicker
          id={id}
          style={{ width: "100%" }}
          value={(value as DateValue) ?? null}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "time":
      return (
        <TimePicker
          id={id}
          style={{ width: "100%" }}
          value={(value as TimeValue) ?? null}
          disabled={disabled}
          onChange={onChange}
        />
      );
    case "checkbox":
      return (
        <Checkbox
          id={id}
          checked={!!value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "switch":
      return <Switch id={id} checked={!!value} disabled={disabled} onChange={onChange} />;
    default:
      return null;
  }
}

/** How `ArrayFieldSection` calls back into the renderer for a nested node. */
type RenderNode = (
  node: FieldNode,
  namePrefix: string,
  opts?: { hideLabel?: boolean; bare?: boolean },
) => React.ReactNode;

/** Per-row reorder/remove controls, shared by the card and table variants. */
function RowControls(props: {
  index: number;
  count: number;
  move: (from: number, to: number) => void;
  remove: (index: number) => void;
}) {
  const { index, count, move, remove } = props;
  return (
    <Space size={4}>
      <Button
        size="small"
        type="text"
        disabled={index === 0}
        onClick={() => move(index, index - 1)}
      >
        ↑
      </Button>
      <Button
        size="small"
        type="text"
        disabled={index === count - 1}
        onClick={() => move(index, index + 1)}
      >
        ↓
      </Button>
      <Button size="small" type="text" danger onClick={() => remove(index)}>
        Remove
      </Button>
    </Space>
  );
}

/** Renders an `array` (Form List) node: a repeatable set of rows authored from the
 *  node's `itemFields`. `useFieldArray` owns add/remove/reorder; each control binds to
 *  `name.{index}.{child}` via `renderNode`. `variant` picks the card or table layout. */
function ArrayFieldSection(props: {
  node: ArrayField;
  control: Control;
  name: string;
  /** Seed object for a freshly appended row (item-field defaultValues). */
  seedRow: () => Record<string, unknown>;
  renderNode: RenderNode;
}) {
  const { node, control, name, seedRow, renderNode } = props;
  const { fields, append, remove, move } = useFieldArray({ control, name });
  const addButton = <Button onClick={() => append(seedRow())}>Add {node.label || "item"}</Button>;
  const help = node.helpText ? (
    <div style={{ color: "rgba(0,0,0,0.45)", fontSize: 12, marginTop: 8 }}>{node.helpText}</div>
  ) : null;

  let body: React.ReactNode;
  if (node.variant === "table") {
    // One column per item field (cells render the control bare + label-less) plus an
    // actions column. dataSource carries each row's react-hook-form index.
    type RowRec = { key: string; index: number };
    const columns = [
      // Nameless layout containers can appear among itemFields; fall back to their
      // label/title (or type) for the header and the index for column identity.
      ...node.itemFields.map((child, col) => ({
        title:
          ("label" in child && child.label) ||
          ("title" in child && child.title) ||
          ("name" in child && child.name) ||
          child.type,
        key: "name" in child ? child.name : `${child.type}-${col}`,
        render: (_: unknown, rec: RowRec) =>
          renderNode(child, `${name}.${rec.index}.`, { hideLabel: true, bare: true }),
      })),
      {
        title: "",
        key: "_actions",
        width: 130,
        render: (_: unknown, rec: RowRec) => (
          <RowControls index={rec.index} count={fields.length} move={move} remove={remove} />
        ),
      },
    ];
    const dataSource: RowRec[] = fields.map((row, i) => ({ key: row.id, index: i }));
    body = (
      <>
        <Table size="small" pagination={false} columns={columns} dataSource={dataSource} />
        <div style={{ marginTop: 8 }}>{addButton}</div>
      </>
    );
  } else {
    body = (
      <>
        {fields.map((row, i) => (
          <Card
            key={row.id}
            size="small"
            style={{ marginBottom: 8 }}
            extra={<RowControls index={i} count={fields.length} move={move} remove={remove} />}
          >
            <Row gutter={16}>
              {node.itemFields.map((c, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: item fields are static per render
                <Fragment key={j}>{renderNode(c, `${name}.${i}.`)}</Fragment>
              ))}
            </Row>
          </Card>
        ))}
        {addButton}
      </>
    );
  }

  return (
    <fieldset style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: 16 }}>
      {node.label ? <legend style={{ padding: "0 8px" }}>{node.label}</legend> : null}
      {body}
      {help}
    </fieldset>
  );
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
    if (isLayoutContainer(node)) {
      schemaDefaults(node.children, into);
    } else if (node.type === "array") {
      // Seed an empty list so useFieldArray stays controlled; row defaults are
      // applied per-row on append, not here.
      into[node.name] = [];
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

  // `namePrefix` lets fields nested in an array bind to `name.{index}.{child}` while
  // top-level fields keep their bare name. `opts` lets a table cell render the control
  // label-less (the column header carries the label) and un-wrapped (full-width cell);
  // `span` lets a grid assign the cell width (the field's own colSpan still wins).
  const renderNode = (
    node: FieldNode,
    namePrefix = "",
    opts?: { hideLabel?: boolean; bare?: boolean; span?: ColSpanProps },
  ): React.ReactNode => {
    if (!isVisible(node, values)) return null; // shared conditional logic
    if (!canView(node, access)) return null; // shared RBAC

    // Children of any container render through this same closure, so visibility,
    // RBAC and array name-prefixes apply at every depth.
    const renderChildren = (children: FieldNode[], childOpts?: { span?: ColSpanProps }) =>
      children.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: schema children are static per render
        <Fragment key={i}>{renderNode(c, namePrefix, childOpts)}</Fragment>
      ));
    const containerSpan = opts?.span ?? { span: 24 };

    if (node.type === "group") {
      return (
        <Col key={node.name} {...containerSpan}>
          <fieldset style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: 16 }}>
            {node.label ? <legend style={{ padding: "0 8px" }}>{node.label}</legend> : null}
            <Row gutter={16}>{renderChildren(node.children)}</Row>
          </fieldset>
        </Col>
      );
    }

    if (node.type === "array") {
      const name = `${namePrefix}${node.name}`;
      return (
        <Col key={name} {...containerSpan}>
          <ArrayFieldSection
            node={node}
            control={control as Control}
            name={name}
            seedRow={() => schemaDefaults(node.itemFields)}
            renderNode={renderNode}
          />
        </Col>
      );
    }

    if (node.type === "tabs") {
      // `forceRender` is load-bearing: antd lazy-mounts inactive panes, and an
      // unmounted pane never registers its RHF Controllers — defaults would be
      // dropped and required errors would point at fields the user can't see.
      const panes = node.children.filter((p) => isVisible(p, values) && canView(p, access));
      return (
        <Col key={`${namePrefix}tabs`} {...containerSpan}>
          <Tabs
            items={panes.map((pane, i) => ({
              key: String(i),
              label: pane.label,
              forceRender: true,
              children: <Row gutter={16}>{renderChildren(pane.children)}</Row>,
            }))}
          />
        </Col>
      );
    }

    if (node.type === "collapse") {
      const panels = node.children.filter((p) => isVisible(p, values) && canView(p, access));
      const keys = panels.map((_, i) => String(i));
      return (
        <Col key={`${namePrefix}collapse`} {...containerSpan}>
          <Collapse
            accordion={node.accordion}
            // All panels start open (first only under accordion) so required
            // fields are visible; forceRender keeps closed panels registered.
            defaultActiveKey={node.accordion ? keys.slice(0, 1) : keys}
            items={panels.map((panel, i) => ({
              key: String(i),
              label: panel.label,
              forceRender: true,
              children: <Row gutter={16}>{renderChildren(panel.children)}</Row>,
            }))}
          />
        </Col>
      );
    }

    if (node.type === "card") {
      return (
        <Col key={`${namePrefix}card`} {...containerSpan}>
          <Card title={node.title}>
            <Row gutter={16}>{renderChildren(node.children)}</Row>
          </Card>
        </Col>
      );
    }

    if (node.type === "grid") {
      const cell = Math.max(1, Math.floor(24 / (node.cols ?? 2)));
      return (
        <Col key={`${namePrefix}grid`} {...containerSpan}>
          <Row gutter={16}>
            {renderChildren(node.children, { span: { xs: 24, sm: 24, md: cell, lg: cell } })}
          </Row>
        </Col>
      );
    }

    if (node.type === "space") {
      return (
        <Col key={`${namePrefix}space`} {...containerSpan}>
          <Space direction={node.direction ?? "horizontal"} wrap>
            {node.children.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: schema children are static per render
              <Fragment key={i}>{renderNode(c, namePrefix, { bare: true })}</Fragment>
            ))}
          </Space>
        </Col>
      );
    }

    if (isLayoutContainer(node)) {
      // Orphaned tab-pane / collapse-panel placed outside their parent (possible
      // in hand-written JSON): render their children as a plain transparent row.
      return (
        <Col key={`${namePrefix}${node.type}`} {...containerSpan}>
          <Row gutter={16}>{renderChildren(node.children)}</Row>
        </Col>
      );
    }

    // Responsive: a grid-assigned span (if any) replaces the default; the field's
    // own per-breakpoint colSpan always wins. antd collapses to xs on small screens.
    const span = { ...(opts?.span ?? DEFAULT_SPAN), ...(node.layout?.colSpan ?? {}) };
    const editable = canEdit(node, access) && node.disabled !== true;
    // A select with a dependent dataSource reads its parent field's current value.
    const dependsOn = node.type === "select" ? node.dataSource?.dependsOn : undefined;
    const dependsOnValue = dependsOn ? values[dependsOn] : undefined;
    const fieldName = `${namePrefix}${node.name}`;
    const control_ = (
      <Controller
        name={fieldName}
        control={control}
        render={({ field, fieldState }) => (
          <Form.Item
            label={opts?.hideLabel ? undefined : node.label}
            htmlFor={opts?.hideLabel ? undefined : fieldName}
            tooltip={opts?.hideLabel ? undefined : node.tooltip}
            required={opts?.hideLabel ? undefined : node.required}
            style={opts?.bare ? { marginBottom: 0 } : undefined}
            validateStatus={fieldState.error ? "error" : undefined}
            help={fieldState.error?.message ?? (opts?.hideLabel ? undefined : node.helpText)}
            {...node.decoratorProps}
          >
            <FieldControl
              node={node}
              value={field.value}
              disabled={!editable}
              onChange={field.onChange}
              dependsOnValue={dependsOnValue}
              id={fieldName}
            />
          </Form.Item>
        )}
      />
    );
    // A table cell renders the control bare (full width); otherwise wrap in a responsive Col.
    if (opts?.bare) return control_;
    return (
      <Col key={fieldName} {...span}>
        {control_}
      </Col>
    );
  };

  const lp = form.layoutProps;
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={theme}>
        <Form
          component={false}
          layout={lp?.layout ?? "vertical"}
          labelCol={lp?.labelCol}
          wrapperCol={lp?.wrapperCol}
          size={lp?.size}
          colon={lp?.colon}
          labelAlign={lp?.labelAlign}
          labelWrap={lp?.labelWrap}
        >
          <form onSubmit={submit} noValidate>
            <Row gutter={16}>
              {form.fields.map((n, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: schema fields are static per render
                <Fragment key={i}>{renderNode(n)}</Fragment>
              ))}
            </Row>
            <Button type="primary" htmlType="submit">
              {submitLabel}
            </Button>
          </form>
        </Form>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
