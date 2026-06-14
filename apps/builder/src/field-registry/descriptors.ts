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
    control: "select",
    choices: [
      { label: "Vertical", value: "vertical" },
      { label: "Horizontal", value: "horizontal" },
      { label: "Inline", value: "inline" },
    ],
  },
  {
    key: "size",
    label: "Size",
    control: "select",
    choices: [
      { label: "Small", value: "small" },
      { label: "Middle", value: "middle" },
      { label: "Large", value: "large" },
    ],
  },
  {
    key: "labelAlign",
    label: "Label align",
    control: "select",
    choices: [
      { label: "Right", value: "right" },
      { label: "Left", value: "left" },
    ],
  },
  { key: "colon", label: "Show colon", control: "checkbox" },
  { key: "labelWrap", label: "Wrap labels", control: "checkbox" },
];
