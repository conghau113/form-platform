import { zodResolver } from "@hookform/resolvers/zod";
import {
  type AccessContext,
  type AsyncValidationResult,
  buildZodSchema,
  canEdit,
  canView,
  checkAsyncValidator,
  collectAsyncFields,
  collectValueEffects,
  collectWarnings,
  computeNodeReactions,
  computeReactions,
  type DataSourceOption,
  dataSourceDeps,
  dataSourceReady,
  type EffectMap,
  effectiveVisible,
  fetchDataSourceOptions,
  isVisible,
  type ReactionOption,
} from "@org/form-core";
import {
  type ArrayField,
  type AsyncValidator,
  CURRENT_FORM_VERSION,
  childrenOf,
  type FieldNode,
  type FormSchema,
  isLayoutContainer,
  type LeafField,
  migrate,
  type StepField,
  type StepsField,
  type TreeOption,
} from "@org/form-schema";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  Cascader,
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
  Steps,
  Switch,
  Table,
  Tabs,
  type ThemeConfig,
  TimePicker,
  TreeSelect,
  Typography,
  Upload,
  type UploadFile,
} from "antd";
import type React from "react";
import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type Control,
  Controller,
  type Resolver,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { openFormDialog } from "./imperative.js";

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
type DateRangeValue = React.ComponentProps<typeof DatePicker.RangePicker>["value"];
type TimeRangeValue = React.ComponentProps<typeof TimePicker.RangePicker>["value"];
type SelectValue = string | number | Array<string | number> | undefined;
type SelectField = Extract<LeafField, { type: "select" }>;
type CheckboxGroupField = Extract<LeafField, { type: "checkbox-group" }>;
type CascaderField = Extract<LeafField, { type: "cascader" }>;
type TreeSelectField = Extract<LeafField, { type: "tree-select" }>;
/** A field that sources options from static `options` or a remote `dataSource`. */
type OptionSourced = SelectField | CheckboxGroupField | CascaderField | TreeSelectField;
type OptionList =
  | ReactionOption[]
  | DataSourceOption[]
  | TreeOption[]
  | { label: string; value: string | number }[];

function isOptionSourced(node: LeafField): node is OptionSourced {
  return (
    node.type === "select" ||
    node.type === "checkbox-group" ||
    node.type === "cascader" ||
    node.type === "tree-select"
  );
}

/** Resolve the option list for a select/checkbox-group, fetching a remote `dataSource`
 *  via react-query when present. Fetching + option mapping live in form-core so native
 *  reuses them; this hook only wires react-query + the dependency gating. Shared by
 *  `SelectControl` and `CheckboxGroupControl`. */
function useRemoteOptions(
  node: OptionSourced,
  depValues: Record<string, unknown>,
  optionsOverride?: ReactionOption[],
): {
  options: OptionList | undefined;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  ready: boolean;
  missing: string[];
} {
  const ds = node.dataSource;
  // A dependent control waits until EVERY field it depends on has a value before fetching.
  const deps = ds ? dataSourceDeps(ds) : [];
  const ready = !ds || dataSourceReady(ds, depValues);
  const missing = deps.filter((field) => depValues[field] == null || depValues[field] === "");

  const query = useQuery<DataSourceOption[]>({
    // Keyed on the url + every dep value, so changing any parent refetches.
    queryKey: ["form-datasource", ds?.url, ...deps.map((field) => depValues[field] ?? null)],
    enabled: !!ds && ready,
    // ds is defined whenever the query is enabled.
    queryFn: () => fetchDataSourceOptions(ds as NonNullable<typeof ds>, depValues),
    // Cache fetched options for ttlMs (default 0 = always fresh).
    staleTime: ds?.ttlMs ?? 0,
  });

  // A reaction `options` effect wins; otherwise static options pass straight
  // through and remote options come from the query.
  const options = optionsOverride ?? (ds ? query.data : node.options);
  return {
    options,
    isFetching: !!ds && query.isFetching,
    isError: query.isError,
    error: query.error,
    ready,
    missing,
  };
}

/** A select whose options may come from a remote dataSource. Only the antd control +
 *  loading/error UI are web-specific; the fetch lives in `useRemoteOptions`. */
function SelectControl(props: {
  node: SelectField;
  value: SelectValue;
  disabled?: boolean;
  onChange: (v: unknown) => void;
  /** Current values of every field this select's dataSource depends on
   *  (`dependsOn` + each `params[].from`), keyed by field name. */
  depValues?: Record<string, unknown>;
  /** Options injected by a reaction `effect: "options"` — overrides static/remote. */
  optionsOverride?: ReactionOption[];
  id?: string;
}) {
  const { node, value, disabled, onChange, depValues = {}, optionsOverride, id } = props;
  const { options, isFetching, isError, error, ready, missing } = useRemoteOptions(
    node,
    depValues,
    optionsOverride,
  );

  let notFoundContent: React.ReactNode;
  if (!ready) notFoundContent = `Select ${missing.join(", ")} first`;
  else if (isError) notFoundContent = (error as Error).message;

  // `tags` mode (free typing) wins over `multiple`; both yield an array value.
  const mode = node.tags ? "tags" : node.multiple ? "multiple" : undefined;

  return (
    <Select
      id={id}
      style={{ width: "100%" }}
      value={value}
      disabled={disabled}
      mode={mode}
      showSearch={node.showSearch}
      allowClear={node.allowClear}
      options={options ?? []}
      loading={isFetching}
      status={isError ? "error" : undefined}
      notFoundContent={notFoundContent}
      onChange={onChange}
    />
  );
}

/** A group of checkboxes whose options may come from a remote dataSource. Value is an
 *  array of the chosen option values. Mirrors `SelectControl`'s option resolution. */
function CheckboxGroupControl(props: {
  node: CheckboxGroupField;
  value: Array<string | number> | undefined;
  disabled?: boolean;
  onChange: (v: unknown) => void;
  depValues?: Record<string, unknown>;
  optionsOverride?: ReactionOption[];
}) {
  const { node, value, disabled, onChange, depValues = {}, optionsOverride } = props;
  const { options, isFetching, isError, error, ready, missing } = useRemoteOptions(
    node,
    depValues,
    optionsOverride,
  );

  if (!ready)
    return <Typography.Text type="secondary">Select {missing.join(", ")} first</Typography.Text>;
  if (isError) return <Typography.Text type="danger">{(error as Error).message}</Typography.Text>;
  if (isFetching) return <Typography.Text type="secondary">Loading…</Typography.Text>;

  // antd's Checkbox.Group has no `id` prop, so the Form.Item label stays unassociated.
  return (
    <Checkbox.Group value={value} disabled={disabled} options={options ?? []} onChange={onChange} />
  );
}

/** Hierarchical path choice. `{label, value, children}` is antd Cascader's native option
 *  shape, so static trees, remote trees (dataSource + childrenKey) and flat reaction
 *  overrides all pass straight through. Mirrors `SelectControl`'s option resolution. */
function CascaderControl(props: {
  node: CascaderField;
  value: Array<string | number> | undefined;
  disabled?: boolean;
  onChange: (v: unknown) => void;
  depValues?: Record<string, unknown>;
  optionsOverride?: ReactionOption[];
  id?: string;
}) {
  const { node, value, disabled, onChange, depValues = {}, optionsOverride, id } = props;
  const { options, isFetching, isError, error, ready, missing } = useRemoteOptions(
    node,
    depValues,
    optionsOverride,
  );

  let notFoundContent: React.ReactNode;
  if (!ready) notFoundContent = `Select ${missing.join(", ")} first`;
  else if (isError) notFoundContent = (error as Error).message;
  else if (isFetching) notFoundContent = "Loading…";

  return (
    <Cascader
      id={id}
      style={{ width: "100%" }}
      value={value}
      disabled={disabled}
      options={options ?? []}
      status={isError ? "error" : undefined}
      notFoundContent={notFoundContent}
      onChange={(v) => onChange(v)}
    />
  );
}

/** Tree dropdown choice; value is the chosen node's value (array when `multiple`).
 *  The explicit `fieldNames` mapping is load-bearing: TreeSelect's default display
 *  field is `title`, while the contract's tree options carry `label`. */
function TreeSelectControl(props: {
  node: TreeSelectField;
  value: SelectValue;
  disabled?: boolean;
  onChange: (v: unknown) => void;
  depValues?: Record<string, unknown>;
  optionsOverride?: ReactionOption[];
  id?: string;
}) {
  const { node, value, disabled, onChange, depValues = {}, optionsOverride, id } = props;
  const { options, isFetching, isError, error, ready, missing } = useRemoteOptions(
    node,
    depValues,
    optionsOverride,
  );

  let notFoundContent: React.ReactNode;
  if (!ready) notFoundContent = `Select ${missing.join(", ")} first`;
  else if (isError) notFoundContent = (error as Error).message;
  else if (isFetching) notFoundContent = "Loading…";

  return (
    <TreeSelect
      id={id}
      style={{ width: "100%" }}
      value={value}
      disabled={disabled}
      multiple={node.multiple}
      treeData={options ?? []}
      fieldNames={{ label: "label", value: "value", children: "children" }}
      status={isError ? "error" : undefined}
      notFoundContent={notFoundContent}
      onChange={onChange}
    />
  );
}

function FieldControl(props: {
  node: LeafField;
  value: unknown;
  disabled?: boolean;
  /** Non-interactive but not greyed (antd `readOnly`). Only the text/number inputs
   *  honor it; other controls are rendered via FieldPreview at the call site instead. */
  readOnly?: boolean;
  onChange: (v: unknown) => void;
  /** Current values of a select's dataSource dependency fields, keyed by name. */
  depValues?: Record<string, unknown>;
  /** Options injected by a reaction `effect: "options"` (select/radio/checkbox-group). */
  optionsOverride?: ReactionOption[];
  /** DOM id linking the control to its Form.Item label (htmlFor). */
  id?: string;
  /** The form's `settings.submitUrl`, used by `upload` to upload for real (otherwise files
   *  stay local). */
  submitUrl?: string;
}) {
  const { node, value, disabled, readOnly, onChange, depValues, optionsOverride, id, submitUrl } =
    props;
  switch (node.type) {
    case "text":
      return (
        <Input
          id={id}
          value={(value as string) ?? ""}
          disabled={disabled}
          readOnly={readOnly}
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
          readOnly={readOnly}
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
          readOnly={readOnly}
          min={node.min}
          max={node.max}
          step={node.step}
          precision={node.precision}
          onChange={onChange}
        />
      );
    case "password":
      return (
        <Input.Password
          id={id}
          value={(value as string) ?? ""}
          disabled={disabled}
          readOnly={readOnly}
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
          depValues={depValues}
          optionsOverride={optionsOverride}
          id={id}
        />
      );
    case "radio":
      return (
        <Radio.Group
          id={id}
          value={value}
          disabled={disabled}
          options={optionsOverride ?? node.options ?? []}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "checkbox-group":
      return (
        <CheckboxGroupControl
          node={node}
          value={value as Array<string | number> | undefined}
          disabled={disabled}
          onChange={onChange}
          depValues={depValues}
          optionsOverride={optionsOverride}
        />
      );
    case "cascader":
      return (
        <CascaderControl
          node={node}
          value={value as Array<string | number> | undefined}
          disabled={disabled}
          onChange={onChange}
          depValues={depValues}
          optionsOverride={optionsOverride}
          id={id}
        />
      );
    case "tree-select":
      return (
        <TreeSelectControl
          node={node}
          value={value as SelectValue}
          disabled={disabled}
          onChange={onChange}
          depValues={depValues}
          optionsOverride={optionsOverride}
          id={id}
        />
      );
    case "upload": {
      // Without a real upload endpoint, `beforeUpload → false` keeps each file local in the
      // fileList (the form value) — no auto-upload. With `settings.submitUrl`, antd uploads
      // for real to that action. The value IS the fileList.
      const fileList = (value as UploadFile[] | undefined) ?? [];
      return (
        <Upload
          fileList={fileList}
          disabled={disabled}
          accept={node.accept}
          maxCount={node.maxCount}
          listType={node.listType}
          action={submitUrl}
          beforeUpload={submitUrl ? undefined : () => false}
          onChange={(info) => onChange(info.fileList)}
        >
          {(!node.maxCount || fileList.length < node.maxCount) && (
            <Button>{node.listType === "picture-card" ? "+ Upload" : "Select file"}</Button>
          )}
        </Upload>
      );
    }
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
          picker={node.picker}
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
    case "date-range":
      // antd v5 types RangePicker's `id` as `{ start?, end? }`; omitting it keeps the
      // label unassociated (same trade-off as ColorPicker). The dayjs [start, end]
      // tuple stays raw in form state, like `date`.
      return (
        <DatePicker.RangePicker
          style={{ width: "100%" }}
          value={(value as DateRangeValue) ?? null}
          disabled={disabled}
          picker={node.picker}
          onChange={onChange}
        />
      );
    case "time-range":
      return (
        <TimePicker.RangePicker
          style={{ width: "100%" }}
          value={(value as TimeRangeValue) ?? null}
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

/** Leaf types whose antd control honors a `readOnly` prop (non-interactive, not greyed).
 *  Other types have no readOnly mode and render through FieldPreview instead. */
const READONLY_INPUT_TYPES = new Set<LeafField["type"]>(["text", "textarea", "password", "number"]);

/** Depth-first label lookup in a tree of options. Flat lists (ReactionOption[],
 *  remote DataSourceOption[]) are just childless trees, so they share it. */
function findTreeLabel(opts: readonly TreeOption[], value: unknown): string | undefined {
  for (const o of opts) {
    if (o.value === value) return o.label;
    if (o.children) {
      const hit = findTreeLabel(o.children, value);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

/** Format a leaf's value as plain read text (Formily's PreviewText). Used by `readPretty`
 *  mode and as the readOnly fallback for controls antd can't render read-only. */
function previewText(node: LeafField, value: unknown, optionsOverride?: ReactionOption[]): string {
  if (value == null || value === "") {
    // A boolean false is a real value (Yes/No), not "empty".
    if (typeof value !== "boolean") return "—";
  }
  switch (node.type) {
    case "password":
      return "••••••";
    case "checkbox":
    case "switch":
      return value ? "Yes" : "No";
    case "select":
    case "radio":
    case "checkbox-group": {
      const opts = optionsOverride ?? ("options" in node ? (node.options ?? []) : []);
      const label = (v: unknown) => opts.find((o) => o.value === v)?.label ?? String(v);
      return Array.isArray(value) ? value.map(label).join(", ") : label(value);
    }
    case "cascader": {
      // The value is a root→leaf path; resolve each segment's label one tree
      // level at a time (remote-only options fall back to the raw segment).
      const path = Array.isArray(value) ? value : [];
      if (!path.length) return "—";
      let level: readonly TreeOption[] = optionsOverride ?? node.options ?? [];
      const labels = path.map((seg) => {
        const hit = level.find((o) => o.value === seg);
        level = hit?.children ?? [];
        return hit?.label ?? String(seg);
      });
      return labels.join(" / ");
    }
    case "tree-select": {
      const opts: readonly TreeOption[] = optionsOverride ?? node.options ?? [];
      const label = (v: unknown) => findTreeLabel(opts, v) ?? String(v);
      return Array.isArray(value) ? value.map(label).join(", ") : label(value);
    }
    case "upload": {
      const files = (value as Array<{ name?: string }> | undefined) ?? [];
      return files.length ? files.map((f) => f.name ?? "file").join(", ") : "—";
    }
    case "date":
    case "time": {
      const fmt = node.type === "date" ? "YYYY-MM-DD" : "HH:mm:ss";
      const v = value as { format?: (f: string) => string } | null;
      return v && typeof v.format === "function" ? v.format(fmt) : String(value);
    }
    case "date-range":
    case "time-range": {
      const fmt = node.type === "date-range" ? "YYYY-MM-DD" : "HH:mm:ss";
      const ends = Array.isArray(value) ? value : [];
      const end = (v: unknown) => {
        if (v == null) return "—";
        const d = v as { format?: (f: string) => string };
        return typeof d.format === "function" ? d.format(fmt) : String(v);
      };
      return `${end(ends[0])} ~ ${end(ends[1])}`;
    }
    default:
      return String(value);
  }
}

/** Plain-text read view of a leaf's value (review / readPretty mode). */
function FieldPreview(props: {
  node: LeafField;
  value: unknown;
  optionsOverride?: ReactionOption[];
}) {
  return (
    <Typography.Text>{previewText(props.node, props.value, props.optionsOverride)}</Typography.Text>
  );
}

/** The reactive scope a node renders in: the MERGED values it sees (outer form values
 *  plus, inside an array row, that row's own values) and the EffectMap computed against
 *  them. Top-level renders carry no scope and fall back to the form's own values/effects. */
type Scope = { values: Record<string, unknown>; effects: EffectMap };

type RenderNodeOpts = {
  hideLabel?: boolean;
  bare?: boolean;
  span?: ColSpanProps;
  path?: number[];
  /** Row scope for fields rendered inside an array row (per-row linkage). */
  scope?: Scope;
};

/** How `ArrayFieldSection` calls back into the renderer for a nested node. Array rows are
 *  not canonical authoring targets, so it never passes `path` — those renders stay
 *  unwrapped by `nodeWrapper`. */
type RenderNode = (node: FieldNode, namePrefix: string, opts?: RenderNodeOpts) => React.ReactNode;

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

/** Read-only text for a table cell in `editInDialog` mode (the row is edited in a popup,
 *  not inline). Only named leaf fields have a value to show; containers render blank. */
function rowCellText(child: FieldNode, row: Record<string, unknown> | undefined): React.ReactNode {
  if (!("name" in child) || !row) return null;
  const v = row[child.name];
  if (v == null || v === "") return null;
  return String(v);
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
  /** Reactive scope for row `i` (merged row values + per-row EffectMap). */
  getRowScope: (index: number) => Scope;
}) {
  const { node, control, name, seedRow, renderNode, getRowScope } = props;
  const { fields, append, remove, move, update } = useFieldArray({ control, name });
  const addButton = <Button onClick={() => append(seedRow())}>Add {node.label || "item"}</Button>;

  // Table + editInDialog: rows are read-only and edited in a popup. Watch the live row
  // values to display the cells and seed the dialog; write the result back with `update`.
  const editInDialog = node.variant === "table" && node.editInDialog === true;
  const watched = useWatch({ control, name }) as Array<Record<string, unknown>> | undefined;
  const openRowDialog = async (index: number) => {
    const result = await openFormDialog(
      {
        formVersion: CURRENT_FORM_VERSION,
        id: node.name,
        title: node.label,
        fields: node.itemFields,
      },
      { title: node.label, initialValues: watched?.[index] ?? {} },
    );
    if (result) update(index, result);
  };
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
          editInDialog
            ? rowCellText(child, watched?.[rec.index])
            : renderNode(child, `${name}.${rec.index}.`, {
                hideLabel: true,
                bare: true,
                scope: getRowScope(rec.index),
              }),
      })),
      {
        title: "",
        key: "_actions",
        width: editInDialog ? 200 : 130,
        render: (_: unknown, rec: RowRec) => (
          <Space size={4}>
            {editInDialog ? (
              <Button size="small" onClick={() => openRowDialog(rec.index)}>
                Edit
              </Button>
            ) : null}
            <RowControls index={rec.index} count={fields.length} move={move} remove={remove} />
          </Space>
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
                <Fragment key={j}>
                  {renderNode(c, `${name}.${i}.`, { scope: getRowScope(i) })}
                </Fragment>
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

/** Renders a `steps` wizard: one `step` pane visible at a time with a Prev/Next footer.
 *  Like tabs, EVERY pane stays mounted (inactive ones hidden with `display:none`) so its
 *  react-hook-form Controllers register — defaults and required errors stay correct.
 *  `Next` validates ONLY the current step's fields; `Submit` (which posts the whole form)
 *  shows only on the last step. Header clicks may jump backward at runtime, freely in
 *  design mode. `renderNode` is a closure (no hooks), so this is a real component owning
 *  the current-step state — same reason `array` uses `ArrayFieldSection`. */
function StepsSection(props: {
  panes: Array<{ pane: StepField; i: number }>;
  here: number[] | undefined;
  renderPaneBody: (pane: StepField, panePath: number[] | undefined) => React.ReactNode;
  stepNames: (pane: StepField) => string[];
  trigger: (names?: string[]) => Promise<boolean>;
  /** react-hook-form's error map (keys are field names) — drives the submit-fail jump. */
  errors: Record<string, unknown>;
  /** Increments on every submit attempt; the signal to jump to the first errored step. */
  submitCount: number;
  designMode: boolean;
  hideSubmit: boolean;
  readPretty: boolean;
  submitLabel: string;
}) {
  const {
    panes,
    here,
    renderPaneBody,
    stepNames,
    trigger,
    errors,
    submitCount,
    designMode,
    hideSubmit,
    readPretty,
    submitLabel,
  } = props;
  const [cur, setCur] = useState(0);
  const count = panes.length;
  const clamped = Math.min(cur, Math.max(0, count - 1));

  // After a submit attempt (valid or not), land on the first step owning an errored field.
  // A clean submit has no errors, so this no-ops. Keyed on submitCount: errors update with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: jump only when a submit is attempted
  useEffect(() => {
    if (submitCount === 0) return;
    const bad = panes.findIndex(({ pane }) => stepNames(pane).some((n) => n in errors));
    if (bad >= 0) setCur(bad);
  }, [submitCount]);

  if (count === 0) return null;
  const isLast = clamped === count - 1;
  const showSubmit = isLast && !designMode && !hideSubmit && !readPretty;

  const next = async () => {
    if (await trigger(stepNames(panes[clamped].pane))) setCur(clamped + 1);
  };

  return (
    <>
      <Steps
        current={clamped}
        // Runtime: header navigates BACKWARD only (forward must clear Next's validation).
        // Design mode: free navigation so the author can inspect any step.
        onChange={(to) => {
          if (designMode || to < clamped) setCur(to);
        }}
        items={panes.map(({ pane }) => ({ title: pane.label, description: pane.description }))}
        style={{ marginBottom: 16 }}
      />
      {panes.map(({ pane, i }, pos) => {
        const panePath = here ? [...here, i] : undefined;
        return (
          <div key={i} style={{ display: pos === clamped ? undefined : "none" }}>
            {renderPaneBody(pane, panePath)}
          </div>
        );
      })}
      {!designMode && (
        <Space style={{ marginTop: 16 }}>
          {clamped > 0 && <Button onClick={() => setCur(clamped - 1)}>Previous</Button>}
          {!isLast && (
            <Button type="primary" onClick={next}>
              Next
            </Button>
          )}
          {showSubmit && (
            <Button type="primary" htmlType="submit">
              {submitLabel}
            </Button>
          )}
        </Space>
      )}
    </>
  );
}

/** Identity of a rendered node, handed to a `nodeWrapper`. `path` is the positional
 *  route to the node — indices into `fields`, then each container's `children` — and is
 *  stable across `migrate()` (which clones but never reorders), so the designer can map
 *  it back to a tree uid. (Array `itemFields` are NOT walked: array rows aren't authored
 *  on the canvas, so their per-row renders are left unwrapped.) */
export interface NodeWrapperContext {
  node: FieldNode;
  path: number[];
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
  /** Designer hook (additive): wrap every authorable node's rendered output, e.g. in a
   *  selection shell carrying `data-designer-node-id`. Absent in normal runtime use, so
   *  runtime output is unchanged. */
  nodeWrapper?: (rendered: React.ReactNode, ctx: NodeWrapperContext) => React.ReactNode;
  /** Design canvas mode: makes leaf controls pointer-inert (so clicks select the node
   *  instead of editing the input — visuals stay true to runtime, unlike `disabled`) and
   *  hides the Submit button. */
  designMode?: boolean;
  /** Hide the built-in Submit button without entering design mode. Used by the imperative
   *  `openFormDialog`/`openFormDrawer` wrappers, which drive submission from the popup's own
   *  OK button via the `FormRendererHandle.submit()` imperative handle. */
  hideSubmit?: boolean;
  /** Form-wide review mode: render every leaf as plain read text (PreviewText) and hide the
   *  Submit button. Per-field `readPretty`/`readOnly` flags in the schema still apply when this
   *  is false. */
  readPretty?: boolean;
}

/** Imperative handle exposed via `ref`. `submit()` programmatically triggers validation +
 *  `onSubmit` exactly as clicking the built-in button would — the popup wrappers call it
 *  from their footer OK button (the popup stays open if validation fails). */
export interface FormRendererHandle {
  submit: () => void;
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
    } else if (
      node.type === "checkbox-group" ||
      node.type === "upload" ||
      node.type === "cascader" ||
      (node.type === "tree-select" && node.multiple)
    ) {
      // Array-valued leaves seed [] so the control stays controlled and a `required`
      // rule surfaces its custom "is required" message (min(1) on an empty array,
      // rather than an "expected array" type error on undefined).
      into[node.name] = [];
    }
  }
  return into;
}

/** True when any node in the tree (at any depth) is of `type`. Used to hide the global
 *  Submit row when a `steps` wizard owns submission. */
function containsType(nodes: FieldNode[], type: FieldNode["type"]): boolean {
  for (const node of nodes) {
    if (node.type === type) return true;
    const kids = childrenOf(node);
    if (kids && containsType(kids, type)) return true;
  }
  return false;
}

/** Top-level value-scope field names reachable inside a step pane — the names a per-step
 *  `trigger()` validates. Value-transparent containers (group/tabs/…) are descended; an
 *  array contributes its own name (triggering it validates the whole list) and its row
 *  fields are not walked (they live under dotted `array.{i}.{child}` paths). */
function collectStepNames(nodes: FieldNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (isLayoutContainer(node)) collectStepNames(node.children, into);
    else if ("name" in node && node.name) into.push(node.name);
  }
  return into;
}

/** Read a dotted react-hook-form path (`members.0.email`) out of a values object. */
function getAtPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Write a resolver error at a dotted path, creating intermediate objects — and
 *  ARRAYS for numeric segments — so `members.0.email` lands where RHF expects it. */
function setErrorAtPath(
  errors: Record<string, unknown>,
  path: string,
  err: { type: string; message: string },
): void {
  const segs = path.split(".");
  let cur: Record<string, unknown> = errors;
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i] as string;
    let next = cur[seg];
    if (next == null || typeof next !== "object") {
      next = /^\d+$/.test(segs[i + 1] as string) ? [] : {};
      cur[seg] = next;
    }
    cur = next as Record<string, unknown>;
  }
  cur[segs[segs.length - 1] as string] = err;
}

type AsyncCacheEntry = { value: unknown; promise: Promise<AsyncValidationResult> };
type AsyncCache = Map<string, AsyncCacheEntry>;

/** One debounced remote check. The entry is registered in the cache BEFORE the
 *  debounce sleep, so a newer keystroke supersedes this one: when the sleep wakes
 *  up under a different cached value, it reports valid without fetching — the
 *  newest entry's own resolver run carries the real verdict. A network failure
 *  fails OPEN (valid) so a flaky endpoint never blocks submit. */
async function runAsyncCheck(
  cache: AsyncCache,
  path: string,
  name: string,
  value: unknown,
  validator: AsyncValidator,
): Promise<AsyncValidationResult> {
  await new Promise((resolve) => setTimeout(resolve, validator.debounceMs ?? 400));
  if (!Object.is(cache.get(path)?.value, value)) return { valid: true };
  try {
    return await checkAsyncValidator(validator, name, value);
  } catch {
    return { valid: true };
  }
}

export const FormRenderer = forwardRef<FormRendererHandle, FormRendererProps>(function FormRenderer(
  {
    schema,
    theme,
    access = { roles: [] },
    initialValues,
    onSubmit,
    submitLabel = "Submit",
    nodeWrapper,
    designMode = false,
    hideSubmit = false,
    readPretty = false,
  },
  ref,
) {
  const form: FormSchema = useMemo(() => migrate(schema), [schema]);

  // Self-contained QueryClient so consumers don't have to provide one. Retries
  // are off so dataSource error states surface immediately. Created once.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );

  // Per-path async-check memo: last value + its (possibly in-flight) check. Entries
  // are registered synchronously in the resolver, so a newer keystroke supersedes an
  // older debounce sleep (see runAsyncCheck). Lives for the component's lifetime.
  const asyncCache = useRef<AsyncCache>(new Map());

  // Validation rebuilds per call so visibility (and RBAC) reflect current values:
  // hidden fields are excluded from validation and stripped from the output. The
  // resolver is ASYNC: after the Zod pass it runs each visible asyncValidator
  // (debounced + memoized per value) and merges `valid:false` results in as field
  // errors — handleSubmit awaits the resolver, so an invalid remote check blocks
  // submit. Fields with a Zod error skip the remote call (one error per field).
  const resolver: Resolver<Values> = async (values, context, options) => {
    const res = await (zodResolver(buildZodSchema(form, { values, access })) as Resolver<Values>)(
      values,
      context,
      options,
    );
    const targets = collectAsyncFields(form, values, access);
    if (targets.length === 0) return res;
    const errors = { ...(res.errors as Record<string, unknown>) };
    let added = false;
    await Promise.all(
      targets.map(async ({ path, name, validator }) => {
        const value = getAtPath(values, path);
        if (value == null || value === "") {
          // Cleared value: drop the memo so re-entering the same value re-checks.
          asyncCache.current.delete(path);
          return;
        }
        if (getAtPath(errors, path)) return;
        let entry = asyncCache.current.get(path);
        if (!entry || !Object.is(entry.value, value)) {
          entry = {
            value,
            promise: runAsyncCheck(asyncCache.current, path, name, value, validator),
          };
          asyncCache.current.set(path, entry);
        }
        const result = await entry.promise;
        if (!result.valid) {
          setErrorAtPath(errors, path, {
            type: "asyncValidator",
            message: result.message ?? "Invalid value",
          });
          added = true;
        }
      }),
    );
    if (!added) return res;
    return { values: {}, errors } as Awaited<ReturnType<Resolver<Values>>>;
  };

  const defaultValues = useMemo<Values>(
    () => ({ ...schemaDefaults(form.fields), ...initialValues }),
    [form, initialValues],
  );

  // `settings.validateTrigger` maps onto react-hook-form's validation mode. Absent ⇒
  // RHF's defaults (validate on submit, re-validate on change) — old JSON behaves
  // exactly as before.
  const trigger = form.settings?.validateTrigger;
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    trigger: triggerFields,
    formState,
  } = useForm<Values>({
    defaultValues,
    resolver,
    mode: trigger === "onInput" ? "onChange" : trigger === "onBlur" ? "onBlur" : "onSubmit",
    reValidateMode: trigger === "onBlur" ? "onBlur" : "onChange",
  });
  const values = watch();

  // Reaction effect map for the TOP-LEVEL scope, recomputed from current values.
  // Per-row array scopes compute their own maps in G4; here `effects` only applies
  // where `namePrefix === ""`.
  const effects = computeReactions(form, values);

  // Non-blocking warning messages, recomputed from watched values (same cost class
  // as reactions). Keys are dotted react-hook-form paths, so array rows look up by
  // their full fieldName. Warnings show immediately — not gated on touched state —
  // by design: a violated warning is visible before the first submit attempt.
  const warnings = collectWarnings(form, values, access);

  // Reaction `value` effects: while a `when` holds, push its assigned value once.
  // Keyed on the serialized assignments so the effect only runs when they change;
  // the per-field JSON diff makes re-assignment idempotent (loop-safe together with
  // the engine's value-cycle guard). Paths are bare names at the top level and dotted
  // `array.{i}.{field}` inside array rows — `setValue` handles both.
  const valueAssignments = collectValueEffects(form, values);
  const assignmentsKey = JSON.stringify(valueAssignments);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the serialized assignments
  useEffect(() => {
    for (const [name, val] of Object.entries(valueAssignments)) {
      if (JSON.stringify(getValues(name)) !== JSON.stringify(val)) {
        setValue(name, val, { shouldDirty: false });
      }
    }
  }, [assignmentsKey]);

  const submit = handleSubmit((data) => {
    // Parse once more to strip hidden/non-viewable keys -> a clean typed payload.
    const clean = buildZodSchema(form, { values: data, access }).parse(data);
    onSubmit?.(clean);
  });

  // Let a popup wrapper trigger submission from its own OK button. `submit` already
  // runs validation and only invokes `onSubmit` on success, so the popup stays open
  // when validation fails.
  useImperativeHandle(ref, () => ({ submit: () => void submit() }), [submit]);

  // `namePrefix` lets fields nested in an array bind to `name.{index}.{child}` while
  // top-level fields keep their bare name. `opts` lets a table cell render the control
  // label-less (the column header carries the label) and un-wrapped (full-width cell);
  // `span` lets a grid assign the cell width (the field's own colSpan still wins);
  // `path` is the positional designer route (absent for array rows, which aren't authored).
  const renderNode = (node: FieldNode, namePrefix = "", opts?: RenderNodeOpts): React.ReactNode => {
    // Inside an array row `opts.scope` carries the merged row values + per-row effects;
    // at the top level we fall back to the form's own values and (only there) `effects`.
    const scope = opts?.scope;
    const scopeValues = scope?.values ?? values;
    const scopeEffects = scope ? scope.effects : namePrefix === "" ? effects : undefined;

    // Reaction `visible` effects override `visibleWhen` at this node's scope.
    if (!effectiveVisible(node, scopeValues, scopeEffects)) return null;
    if (!canView(node, access)) return null; // shared RBAC

    const here = opts?.path;
    // Wrap any node's rendered output in the designer shell (when a `nodeWrapper` and a
    // canonical `path` are present). Used for the node itself and for child panes.
    const wrap = (n: FieldNode, path: number[] | undefined, inner: React.ReactNode) =>
      nodeWrapper && path ? nodeWrapper(inner, { node: n, path }) : inner;
    const wrapNode = (inner: React.ReactNode) => wrap(node, here, inner);

    // Children of any container render through this same closure, so visibility,
    // RBAC and array name-prefixes apply at every depth. `basePath` extends the
    // positional path; index `i` is the child's true slot (null renders keep it).
    const renderChildrenAt = (
      children: FieldNode[],
      basePath: number[] | undefined,
      childOpts?: { span?: ColSpanProps },
    ) =>
      children.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: schema children are static per render
        <Fragment key={i}>
          {renderNode(c, namePrefix, {
            ...childOpts,
            path: basePath ? [...basePath, i] : undefined,
            scope,
          })}
        </Fragment>
      ));
    const containerSpan = opts?.span ?? { span: 24 };

    if (node.type === "group") {
      return (
        <Col key={node.name} {...containerSpan}>
          {wrapNode(
            <fieldset
              style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: 16 }}
            >
              {node.label ? <legend style={{ padding: "0 8px" }}>{node.label}</legend> : null}
              <Row gutter={16}>{renderChildrenAt(node.children, here)}</Row>
            </fieldset>,
          )}
        </Col>
      );
    }

    if (node.type === "array") {
      const name = `${namePrefix}${node.name}`;
      // Each row sees a MERGED scope (outer values + that row's own values, row wins) so
      // its fields' visibleWhen/reactions can reference both. Reactions recompute per row.
      const arrayNode = node;
      const getRowScope = (index: number): Scope => {
        const rows = scopeValues[arrayNode.name];
        const row = (Array.isArray(rows) ? (rows[index] ?? {}) : {}) as Record<string, unknown>;
        const merged = { ...scopeValues, ...row };
        return { values: merged, effects: computeNodeReactions(arrayNode.itemFields, merged) };
      };
      return (
        <Col key={name} {...containerSpan}>
          {wrapNode(
            <ArrayFieldSection
              node={node}
              control={control as Control}
              name={name}
              seedRow={() => schemaDefaults(node.itemFields)}
              renderNode={renderNode}
              getRowScope={getRowScope}
            />,
          )}
        </Col>
      );
    }

    if (node.type === "tabs") {
      // `forceRender` is load-bearing: antd lazy-mounts inactive panes, and an
      // unmounted pane never registers its RHF Controllers — defaults would be
      // dropped and required errors would point at fields the user can't see.
      // Map with the ORIGINAL index first, then filter, so a hidden pane never
      // shifts the positional paths of its siblings/children.
      // Carry each pane's ORIGINAL index so a hidden pane never shifts a sibling's
      // designer path; antd's tab `key` still uses the filtered position (`pos`), so the
      // runtime DOM is unchanged.
      const panes = node.children
        .map((pane, i) => ({ pane, i }))
        .filter(({ pane }) => isVisible(pane, scopeValues) && canView(pane, access));
      return (
        <Col key={`${namePrefix}tabs`} {...containerSpan}>
          {wrapNode(
            <Tabs
              items={panes.map(({ pane, i }, pos) => {
                const panePath = here ? [...here, i] : undefined;
                return {
                  key: String(pos),
                  label: pane.label,
                  forceRender: true,
                  children: wrap(
                    pane,
                    panePath,
                    <Row gutter={16}>{renderChildrenAt(pane.children, panePath)}</Row>,
                  ),
                };
              })}
            />,
          )}
        </Col>
      );
    }

    if (node.type === "collapse") {
      // Original index drives the designer path; antd's panel `key` stays the filtered
      // position (`pos`), so `defaultActiveKey` and the DOM match the old runtime exactly.
      const panels = node.children
        .map((panel, i) => ({ panel, i }))
        .filter(({ panel }) => isVisible(panel, scopeValues) && canView(panel, access));
      const keys = panels.map((_, pos) => String(pos));
      return (
        <Col key={`${namePrefix}collapse`} {...containerSpan}>
          {wrapNode(
            <Collapse
              accordion={node.accordion}
              // All panels start open (first only under accordion) so required
              // fields are visible; forceRender keeps closed panels registered.
              defaultActiveKey={node.accordion ? keys.slice(0, 1) : keys}
              items={panels.map(({ panel, i }, pos) => {
                const panelPath = here ? [...here, i] : undefined;
                return {
                  key: String(pos),
                  label: panel.label,
                  forceRender: true,
                  children: wrap(
                    panel,
                    panelPath,
                    <Row gutter={16}>{renderChildrenAt(panel.children, panelPath)}</Row>,
                  ),
                };
              })}
            />,
          )}
        </Col>
      );
    }

    if (node.type === "card") {
      return (
        <Col key={`${namePrefix}card`} {...containerSpan}>
          {wrapNode(
            <Card title={node.title}>
              <Row gutter={16}>{renderChildrenAt(node.children, here)}</Row>
            </Card>,
          )}
        </Col>
      );
    }

    if (node.type === "grid") {
      const cell = Math.max(1, Math.floor(24 / (node.cols ?? 2)));
      return (
        <Col key={`${namePrefix}grid`} {...containerSpan}>
          {wrapNode(
            <Row gutter={16}>
              {renderChildrenAt(node.children, here, {
                span: { xs: 24, sm: 24, md: cell, lg: cell },
              })}
            </Row>,
          )}
        </Col>
      );
    }

    if (node.type === "space") {
      return (
        <Col key={`${namePrefix}space`} {...containerSpan}>
          {wrapNode(
            <Space direction={node.direction ?? "horizontal"} wrap>
              {node.children.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: schema children are static per render
                <Fragment key={i}>
                  {renderNode(c, namePrefix, {
                    bare: true,
                    path: here ? [...here, i] : undefined,
                    scope,
                  })}
                </Fragment>
              ))}
            </Space>,
          )}
        </Col>
      );
    }

    if (node.type === "steps") {
      // Visible panes carry their ORIGINAL index `i` (so a hidden step never shifts a
      // sibling's designer path), filtered exactly like the tabs case.
      const panes = node.children
        .map((pane, i) => ({ pane, i }))
        .filter(({ pane }) => isVisible(pane, scopeValues) && canView(pane, access));
      return (
        <Col key={`${namePrefix}steps`} {...containerSpan}>
          {wrapNode(
            <StepsSection
              panes={panes}
              here={here}
              renderPaneBody={(pane, panePath) =>
                wrap(
                  pane,
                  panePath,
                  <Row gutter={16}>{renderChildrenAt(pane.children, panePath)}</Row>,
                )
              }
              stepNames={(pane) => collectStepNames(pane.children)}
              trigger={triggerFields}
              errors={formState.errors as Record<string, unknown>}
              submitCount={formState.submitCount}
              designMode={designMode}
              hideSubmit={hideSubmit}
              readPretty={readPretty}
              submitLabel={submitLabel}
            />,
          )}
        </Col>
      );
    }

    if (isLayoutContainer(node)) {
      // Orphaned tab-pane / collapse-panel placed outside their parent (possible
      // in hand-written JSON): render their children as a plain transparent row.
      return (
        <Col key={`${namePrefix}${node.type}`} {...containerSpan}>
          {wrapNode(<Row gutter={16}>{renderChildrenAt(node.children, here)}</Row>)}
        </Col>
      );
    }

    // Responsive: a grid-assigned span (if any) replaces the default; the field's
    // own per-breakpoint colSpan always wins. antd collapses to xs on small screens.
    const span = { ...(opts?.span ?? DEFAULT_SPAN), ...(node.layout?.colSpan ?? {}) };
    // Reaction effects for this leaf, at its own scope (a row's EffectMap inside an
    // array, the top-level map otherwise). A `disabled` effect can re-enable a statically
    // disabled field; an `options` effect overrides select/radio.
    const eff = scopeEffects?.[node.name];
    const editable = canEdit(node, access) && !(eff?.disabled ?? node.disabled === true);
    // Interaction pattern (precedence readPretty > readOnly > disabled). A form-wide
    // `readPretty` review mode forces every leaf to the read view.
    const readPrettyMode = readPretty || node.readPretty === true;
    const readOnlyMode = !readPrettyMode && node.readOnly === true;
    // readPretty always previews; readOnly previews too for controls antd can't render
    // read-only (everything except the text/number inputs).
    const usePreview = readPrettyMode || (readOnlyMode && !READONLY_INPUT_TYPES.has(node.type));
    // The asterisk reflects a reaction `required` effect when present, else the static flag.
    const requiredMark = eff?.required ?? node.required;
    // A select with a dependent dataSource reads each dependency field's current value
    // (the `dependsOn` parent + every `params[].from`), keyed by field name.
    // NOTE: deps resolve against the row scope's merged values; a top-level dep referenced
    // from inside a row reads the merged value (out of G4 scope to change — see plan risk #4).
    // Every option-sourced control (select/checkbox-group/cascader/tree-select) can
    // read options from a dependent dataSource.
    const optionDs = isOptionSourced(node) ? node.dataSource : undefined;
    const depValues = optionDs
      ? Object.fromEntries(dataSourceDeps(optionDs).map((field) => [field, scopeValues[field]]))
      : undefined;
    const fieldName = `${namePrefix}${node.name}`;
    // Non-blocking warning at this field's dotted path. An error always wins the
    // status + help slot; a warning shows antd's yellow state but never blocks.
    const warning = warnings[fieldName];
    const control_ = (
      <Controller
        name={fieldName}
        control={control}
        render={({ field, fieldState }) => (
          <Form.Item
            label={opts?.hideLabel ? undefined : node.label}
            htmlFor={opts?.hideLabel ? undefined : fieldName}
            tooltip={opts?.hideLabel ? undefined : node.tooltip}
            required={opts?.hideLabel ? undefined : requiredMark}
            style={opts?.bare ? { marginBottom: 0 } : undefined}
            validateStatus={fieldState.error ? "error" : warning ? "warning" : undefined}
            help={
              fieldState.error?.message ?? warning ?? (opts?.hideLabel ? undefined : node.helpText)
            }
            {...node.decoratorProps}
          >
            {/* readPretty / readOnly-without-antd-support → a plain read view (PreviewText).
                In design mode the control stays fully visible but pointer-inert (a click
                selects the node instead of typing into the input). Runtime renders the
                control directly so its DOM is byte-for-byte unchanged. */}
            {usePreview ? (
              <FieldPreview node={node} value={field.value} optionsOverride={eff?.options} />
            ) : designMode ? (
              <div style={{ pointerEvents: "none" }}>
                <FieldControl
                  node={node}
                  value={field.value}
                  disabled={!editable && !readOnlyMode}
                  readOnly={readOnlyMode}
                  onChange={field.onChange}
                  depValues={depValues}
                  optionsOverride={eff?.options}
                  id={fieldName}
                  submitUrl={form.settings?.submitUrl}
                />
              </div>
            ) : trigger === "onBlur" ? (
              // RHF's onBlur mode needs `field.onBlur` to fire; the controls don't
              // thread it, so a boxless (display:contents) wrapper catches the
              // bubbling focusout. Only rendered under the onBlur trigger — every
              // other form keeps its runtime DOM byte-for-byte unchanged.
              // biome-ignore lint/a11y/noStaticElementInteractions: invisible display:contents wrapper only threads RHF's onBlur, no semantic role
              <div style={{ display: "contents" }} onBlur={field.onBlur}>
                <FieldControl
                  node={node}
                  value={field.value}
                  disabled={!editable && !readOnlyMode}
                  readOnly={readOnlyMode}
                  onChange={field.onChange}
                  depValues={depValues}
                  optionsOverride={eff?.options}
                  id={fieldName}
                  submitUrl={form.settings?.submitUrl}
                />
              </div>
            ) : (
              <FieldControl
                node={node}
                value={field.value}
                disabled={!editable && !readOnlyMode}
                readOnly={readOnlyMode}
                onChange={field.onChange}
                depValues={depValues}
                optionsOverride={eff?.options}
                id={fieldName}
                submitUrl={form.settings?.submitUrl}
              />
            )}
          </Form.Item>
        )}
      />
    );
    // A table cell renders the control bare (full width); otherwise wrap in a responsive Col.
    if (opts?.bare) return wrapNode(control_);
    return (
      <Col key={fieldName} {...span}>
        {wrapNode(control_)}
      </Col>
    );
  };

  const lp = form.layoutProps;
  // A `steps` wizard owns its own Submit (on the last step), so hide the global one.
  const hasSteps = useMemo(() => containsType(form.fields, "steps"), [form]);
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
                <Fragment key={i}>{renderNode(n, "", { path: [i] })}</Fragment>
              ))}
            </Row>
            {/* The Submit button is meaningless on the design canvas, in form-wide review
                (readPretty) mode, and when a popup wrapper drives submission (hideSubmit). */}
            {!designMode && !hideSubmit && !readPretty && !hasSteps && (
              <Button type="primary" htmlType="submit">
                {submitLabel}
              </Button>
            )}
          </form>
        </Form>
      </ConfigProvider>
    </QueryClientProvider>
  );
});
