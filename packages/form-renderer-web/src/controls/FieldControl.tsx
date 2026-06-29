import type { ReactionOption } from "@org/form-core";
import type { LeafField } from "@org/form-schema";
import {
  Button,
  Checkbox,
  ColorPicker,
  DatePicker,
  Input,
  InputNumber,
  Radio,
  Rate,
  Slider,
  Switch,
  TimePicker,
  type TimePickerProps,
  Upload,
  type UploadFile,
} from "antd";
import { resolveIconNode } from "../icons/index.js";
import type {
  DateRangeValue,
  DateValue,
  SelectValue,
  TimeRangeValue,
  TimeValue,
} from "../internal/control-types.js";
import { numberFormatProps } from "../internal/number-format.js";
import { CascaderControl } from "./CascaderControl.js";
import { CheckboxGroupControl } from "./CheckboxGroupControl.js";
import { SelectControl } from "./SelectControl.js";
import { TreeSelectControl } from "./TreeSelectControl.js";

/** Forward antd `addonBefore`/`addonAfter` only when the field actually configures one. Passing the
 *  key at all — even `undefined` — trips antd 5.x's deprecation warning (it checks `'addonBefore' in
 *  props`), so an omitted addon would otherwise warn on every input render. */
function addonProps(node: { addonBefore?: string; addonAfter?: string }): {
  addonBefore?: string;
  addonAfter?: string;
} {
  return {
    ...(node.addonBefore !== undefined ? { addonBefore: node.addonBefore } : {}),
    ...(node.addonAfter !== undefined ? { addonAfter: node.addonAfter } : {}),
  };
}

/** Maps a rate `character` preset to the glyph passed to antd's Rate. `star` keeps antd's
 *  default star icon (undefined); the others are plain text glyphs — no icon import. */
const RATE_CHARACTER: Record<string, string | undefined> = {
  star: undefined,
  heart: "❤",
  like: "👍",
};

export function FieldControl(props: {
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
          allowClear={node.allowClear}
          showCount={node.showCount}
          prefix={resolveIconNode(node.prefixIcon) ?? node.prefix}
          suffix={resolveIconNode(node.suffixIcon) ?? node.suffix}
          {...addonProps(node)}
          size={node.size}
          variant={node.variant}
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
          allowClear={node.allowClear}
          showCount={node.showCount}
          autoSize={node.autoSize}
          size={node.size}
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
          prefix={resolveIconNode(node.prefixIcon) ?? node.prefix}
          {...addonProps(node)}
          controls={node.controls}
          keyboard={node.keyboard}
          size={node.size}
          variant={node.variant}
          onChange={onChange}
          {...numberFormatProps(node)}
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
          allowClear={node.allowClear}
          size={node.size}
          variant={node.variant}
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
          optionType={node.optionType}
          buttonStyle={node.buttonStyle}
          size={node.size}
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
      // Shared props for both the button and the dragger variant.
      const uploadProps = {
        fileList,
        disabled,
        accept: node.accept,
        maxCount: node.maxCount,
        listType: node.listType,
        multiple: node.multiple,
        directory: node.directory,
        action: submitUrl,
        beforeUpload: submitUrl ? undefined : () => false,
        onChange: (info: { fileList: UploadFile[] }) => onChange(info.fileList),
      };
      const room = !node.maxCount || fileList.length < node.maxCount;
      // The Dragger renders a full drop‑zone; the default renders a compact trigger button.
      if (node.dragger) {
        return (
          <Upload.Dragger {...uploadProps}>
            <p className="ant-upload-text">Click or drag file to this area to upload</p>
          </Upload.Dragger>
        );
      }
      return (
        <Upload {...uploadProps}>
          {room && <Button>{node.listType === "picture-card" ? "+ Upload" : "Select file"}</Button>}
        </Upload>
      );
    }
    case "slider":
      // antd types Slider's props as a single|range union keyed off `range`, so the two
      // shapes (scalar vs. [start, end] value) are rendered as distinct elements.
      return node.range ? (
        <Slider
          range
          vertical={node.vertical}
          dots={node.dots}
          value={(value as [number, number]) ?? [node.min ?? 0, node.max ?? 100]}
          disabled={disabled}
          min={node.min}
          max={node.max}
          step={node.step}
          onChange={onChange}
        />
      ) : (
        <Slider
          id={id}
          vertical={node.vertical}
          dots={node.dots}
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
          allowClear={node.allowClear}
          character={RATE_CHARACTER[node.character ?? "star"]}
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
          format={node.format}
          showTime={node.showTime}
          allowClear={node.allowClear}
          size={node.size}
          variant={node.variant}
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
          format={node.format}
          use12Hours={node.use12Hours}
          minuteStep={node.minuteStep as TimePickerProps["minuteStep"]}
          allowClear={node.allowClear}
          size={node.size}
          variant={node.variant}
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
          format={node.format}
          showTime={node.showTime}
          allowClear={node.allowClear}
          size={node.size}
          variant={node.variant}
          onChange={onChange}
        />
      );
    case "time-range":
      return (
        <TimePicker.RangePicker
          style={{ width: "100%" }}
          value={(value as TimeRangeValue) ?? null}
          disabled={disabled}
          format={node.format}
          use12Hours={node.use12Hours}
          minuteStep={node.minuteStep as TimePickerProps["minuteStep"]}
          allowClear={node.allowClear}
          size={node.size}
          variant={node.variant}
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
      return (
        <Switch
          id={id}
          checked={!!value}
          disabled={disabled}
          checkedChildren={node.checkedChildren}
          unCheckedChildren={node.unCheckedChildren}
          size={node.size}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}
