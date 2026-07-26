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
  label: "Chữ gợi ý",
  control: "text",
};
export const maxLength: SettingDescriptor = {
  key: "maxLength",
  label: "Độ dài tối đa",
  control: "number",
};
export const optionsSetting: SettingDescriptor = {
  key: "options",
  label: "Tùy chọn",
  control: "options",
};

/** Shared antd `size` override (small/middle/large) — input + choice families. */
export const sizeSetting: SettingDescriptor = {
  key: "size",
  label: "Kích thước",
  control: "segmented",
  choices: [
    { label: "Nhỏ", value: "small" },
    { label: "Vừa", value: "middle" },
    { label: "Lớn", value: "large" },
  ],
};
/** Shared antd input `variant` (border treatment). */
export const variantSetting: SettingDescriptor = {
  key: "variant",
  label: "Kiểu viền",
  control: "segmented",
  choices: [
    { label: "Có viền", value: "outlined" },
    { label: "Nền đặc", value: "filled" },
    { label: "Không viền", value: "borderless" },
  ],
};
export const pickerSetting: SettingDescriptor = {
  key: "picker",
  label: "Kiểu chọn",
  control: "select",
  choices: [
    { label: "Ngày", value: "date" },
    { label: "Tuần", value: "week" },
    { label: "Tháng", value: "month" },
    { label: "Quý", value: "quarter" },
    { label: "Năm", value: "year" },
  ],
};

/** Display props shared by the date pickers (X4). `format` is a dayjs token string. */
export const DATE_SETTINGS: SettingDescriptor[] = [
  { key: "format", label: "Định dạng", control: "text" },
  { key: "showTime", label: "Hiện giờ", control: "checkbox" },
  { key: "allowClear", label: "Cho phép xóa", control: "checkbox" },
  sizeSetting,
  variantSetting,
];

/** Display props shared by the time pickers (X4). */
export const TIME_SETTINGS: SettingDescriptor[] = [
  { key: "format", label: "Định dạng", control: "text" },
  { key: "use12Hours", label: "Đồng hồ 12 giờ", control: "checkbox" },
  { key: "minuteStep", label: "Bước phút", control: "number" },
  { key: "allowClear", label: "Cho phép xóa", control: "checkbox" },
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
    label: "Bố cục",
    control: "segmented",
    choices: [
      { label: "Dọc", value: "vertical" },
      { label: "Ngang", value: "horizontal" },
      { label: "Cùng dòng", value: "inline" },
    ],
  },
  {
    key: "size",
    label: "Kích thước",
    control: "segmented",
    choices: [
      { label: "Nhỏ", value: "small" },
      { label: "Vừa", value: "middle" },
      { label: "Lớn", value: "large" },
    ],
  },
  {
    key: "labelAlign",
    label: "Canh nhãn",
    control: "segmented",
    choices: [
      { label: "Phải", value: "right" },
      { label: "Trái", value: "left" },
    ],
  },
  { key: "colon", label: "Hiện dấu hai chấm", control: "checkbox" },
  { key: "labelWrap", label: "Xuống dòng nhãn", control: "checkbox" },
];
