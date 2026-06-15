import type { ComponentBehavior, SettingDescriptor, ValidationRuleType } from "./types";

/** Rule kinds offered for text-like inputs (string length, regex, named formats). */
export const STRING_RULES: ValidationRuleType[] = [
  "required",
  "len",
  "min",
  "max",
  "pattern",
  "format",
  "cross",
];
/** Rule kinds offered for numeric inputs. */
export const NUMBER_RULES: ValidationRuleType[] = ["required", "min", "max", "cross"];

export const placeholder: SettingDescriptor = {
  key: "placeholder",
  label: "Placeholder",
  control: "text",
};
export const maxLength: SettingDescriptor = {
  key: "maxLength",
  label: "Max length",
  control: "number",
};
export const optionsSetting: SettingDescriptor = {
  key: "options",
  label: "Options",
  control: "options",
};

/** Shared antd `size` override (small/middle/large) — input + choice families. */
export const sizeSetting: SettingDescriptor = {
  key: "size",
  label: "Size",
  control: "segmented",
  choices: [
    { label: "Small", value: "small" },
    { label: "Middle", value: "middle" },
    { label: "Large", value: "large" },
  ],
};
/** Shared antd input `variant` (border treatment). */
export const variantSetting: SettingDescriptor = {
  key: "variant",
  label: "Variant",
  control: "segmented",
  choices: [
    { label: "Outlined", value: "outlined" },
    { label: "Filled", value: "filled" },
    { label: "Borderless", value: "borderless" },
  ],
};
export const pickerSetting: SettingDescriptor = {
  key: "picker",
  label: "Picker",
  control: "select",
  choices: [
    { label: "Date", value: "date" },
    { label: "Week", value: "week" },
    { label: "Month", value: "month" },
    { label: "Quarter", value: "quarter" },
    { label: "Year", value: "year" },
  ],
};

/** Display props shared by the date pickers (X4). `format` is a dayjs token string. */
export const DATE_SETTINGS: SettingDescriptor[] = [
  { key: "format", label: "Format", control: "text" },
  { key: "showTime", label: "Show time", control: "checkbox" },
  { key: "allowClear", label: "Allow clear", control: "checkbox" },
  sizeSetting,
  variantSetting,
];

/** Display props shared by the time pickers (X4). */
export const TIME_SETTINGS: SettingDescriptor[] = [
  { key: "format", label: "Format", control: "text" },
  { key: "use12Hours", label: "12-hour clock", control: "checkbox" },
  { key: "minuteStep", label: "Minute step", control: "number" },
  { key: "allowClear", label: "Allow clear", control: "checkbox" },
  sizeSetting,
  variantSetting,
];

/** A value-bearing leaf input: draggable, not droppable. */
export const LEAF: ComponentBehavior = {
  droppable: false,
  draggable: true,
  cloneable: true,
  deletable: true,
};
/** A generic container: holds any non-pane child, fully drag/clone/deletable. */
export const CONTAINER: ComponentBehavior = {
  droppable: true,
  draggable: true,
  cloneable: true,
  deletable: true,
};

/** Layout-prop settings for the root Form node (Phase F SettingsPanel renders these). */
export const FORM_SETTINGS: SettingDescriptor[] = [
  {
    key: "layout",
    label: "Layout",
    control: "segmented",
    choices: [
      { label: "Vertical", value: "vertical" },
      { label: "Horizontal", value: "horizontal" },
      { label: "Inline", value: "inline" },
    ],
  },
  {
    key: "size",
    label: "Size",
    control: "segmented",
    choices: [
      { label: "Small", value: "small" },
      { label: "Middle", value: "middle" },
      { label: "Large", value: "large" },
    ],
  },
  {
    key: "labelAlign",
    label: "Label align",
    control: "segmented",
    choices: [
      { label: "Right", value: "right" },
      { label: "Left", value: "left" },
    ],
  },
  { key: "colon", label: "Show colon", control: "checkbox" },
  { key: "labelWrap", label: "Wrap labels", control: "checkbox" },
];
