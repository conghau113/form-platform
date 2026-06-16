import type { Preset } from "@org/form-schema";

/**
 * Built-in presets ship with the builder (they are NOT persisted via the api — that store
 * holds user presets only). This is the full, curated library (Track P / P3): common,
 * ready-to-drop field templates spanning the input / number / date / choice / upload
 * families.
 *
 * Each preset's `patch` only uses keys valid for its `fieldType` (guarded by
 * builtin.test.ts, which parses a freshly seeded node against the contract), and every
 * `icon` token is one shipped by the web renderer's `antd:` namespace (BUILTIN_ICON_TOKENS).
 * Presets are leaf-only by design: a container preset would carry nested `children` whose
 * names `newField` does not re-seed, so dropping it twice would dupe inner names.
 */
export const BUILTIN_PRESETS: Preset[] = [
  // ── Text inputs ──────────────────────────────────────────────────────────
  {
    id: "builtin-search",
    fieldType: "text",
    name: "Search input",
    icon: "antd:SearchOutlined",
    patch: {
      label: "Search",
      prefixIcon: "antd:SearchOutlined",
      placeholder: "Search",
      allowClear: true,
    },
  },
  {
    id: "builtin-email",
    fieldType: "text",
    name: "Email",
    icon: "antd:MailOutlined",
    patch: {
      label: "Email",
      prefixIcon: "antd:MailOutlined",
      placeholder: "name@example.com",
      allowClear: true,
      validations: [{ type: "format", format: "email", message: "Enter a valid email" }],
    },
  },
  {
    id: "builtin-full-name",
    fieldType: "text",
    name: "Full name",
    icon: "antd:UserOutlined",
    patch: { label: "Full name", prefixIcon: "antd:UserOutlined", placeholder: "Jane Doe" },
  },
  {
    id: "builtin-username",
    fieldType: "text",
    name: "Username",
    icon: "antd:UserOutlined",
    patch: {
      label: "Username",
      prefixIcon: "antd:UserOutlined",
      placeholder: "username",
      allowClear: true,
      maxLength: 32,
    },
  },
  {
    id: "builtin-phone",
    fieldType: "text",
    name: "Phone number",
    icon: "antd:PhoneOutlined",
    patch: {
      label: "Phone",
      prefixIcon: "antd:PhoneOutlined",
      placeholder: "+1 555 000 0000",
      validations: [{ type: "format", format: "phone", message: "Enter a valid phone number" }],
    },
  },
  {
    id: "builtin-website",
    fieldType: "text",
    name: "Website URL",
    icon: "antd:LinkOutlined",
    patch: {
      label: "Website",
      prefixIcon: "antd:LinkOutlined",
      placeholder: "https://example.com",
      validations: [{ type: "format", format: "url", message: "Enter a valid URL" }],
    },
  },
  {
    id: "builtin-otp",
    fieldType: "text",
    name: "OTP code",
    icon: "antd:LockOutlined",
    patch: {
      label: "One-time code",
      prefixIcon: "antd:LockOutlined",
      placeholder: "000000",
      maxLength: 6,
      validations: [
        { type: "format", format: "integer", message: "Digits only" },
        { type: "len", value: 6, message: "Must be 6 digits" },
      ],
    },
  },

  // ── Password ────────────────────────────────────────────────────────────
  {
    id: "builtin-password",
    fieldType: "password",
    name: "Password",
    icon: "antd:LockOutlined",
    patch: {
      label: "Password",
      placeholder: "••••••••",
      allowClear: true,
      validations: [{ type: "min", value: 8, message: "At least 8 characters" }],
    },
  },

  // ── Multiline text ───────────────────────────────────────────────────────
  {
    id: "builtin-description",
    fieldType: "textarea",
    name: "Description",
    icon: "antd:EditOutlined",
    patch: {
      label: "Description",
      placeholder: "Add a description…",
      rows: 4,
      showCount: true,
      maxLength: 500,
    },
  },
  {
    id: "builtin-address",
    fieldType: "textarea",
    name: "Address",
    icon: "antd:EnvironmentOutlined",
    patch: {
      label: "Address",
      placeholder: "Street, city, postal code",
      autoSize: { minRows: 2, maxRows: 5 },
    },
  },

  // ── Numbers ────────────────────────────────────────────────────────────
  {
    id: "builtin-currency-usd",
    fieldType: "number",
    name: "Currency (USD)",
    icon: "antd:DollarOutlined",
    patch: {
      label: "Amount",
      prefixIcon: "antd:DollarOutlined",
      displayFormat: "currency",
      currency: "USD",
      precision: 2,
      min: 0,
    },
  },
  {
    id: "builtin-currency-eur",
    fieldType: "number",
    name: "Currency (EUR)",
    icon: "antd:EuroOutlined",
    patch: {
      label: "Amount",
      prefixIcon: "antd:EuroOutlined",
      displayFormat: "currency",
      currency: "EUR",
      precision: 2,
      min: 0,
    },
  },
  {
    id: "builtin-percentage",
    fieldType: "number",
    name: "Percentage",
    icon: "antd:PercentageOutlined",
    patch: {
      label: "Percentage",
      prefixIcon: "antd:PercentageOutlined",
      displayFormat: "percent",
      min: 0,
      max: 100,
      precision: 0,
    },
  },
  {
    id: "builtin-quantity",
    fieldType: "number",
    name: "Quantity",
    icon: "antd:NumberOutlined",
    patch: {
      label: "Quantity",
      prefixIcon: "antd:NumberOutlined",
      min: 0,
      step: 1,
      precision: 0,
    },
  },

  // ── Dates & times ──────────────────────────────────────────────────────
  {
    id: "builtin-date-of-birth",
    fieldType: "date",
    name: "Date of birth",
    icon: "antd:CalendarOutlined",
    patch: { label: "Date of birth", format: "DD/MM/YYYY", allowClear: true },
  },
  {
    id: "builtin-datetime",
    fieldType: "date",
    name: "Date & time",
    icon: "antd:CalendarOutlined",
    patch: { label: "Date & time", showTime: true, format: "YYYY-MM-DD HH:mm", allowClear: true },
  },
  {
    id: "builtin-month",
    fieldType: "date",
    name: "Month",
    icon: "antd:CalendarOutlined",
    patch: { label: "Month", picker: "month", format: "YYYY-MM" },
  },
  {
    id: "builtin-date-range",
    fieldType: "date-range",
    name: "Date range",
    icon: "antd:CalendarOutlined",
    patch: { label: "Date range", format: "YYYY-MM-DD", allowClear: true },
  },
  {
    id: "builtin-time",
    fieldType: "time",
    name: "Time",
    icon: "antd:ClockCircleOutlined",
    patch: { label: "Time", format: "HH:mm", minuteStep: 15, allowClear: true },
  },

  // ── Choice ────────────────────────────────────────────────────────────
  {
    id: "builtin-yes-no",
    fieldType: "radio",
    name: "Yes / No",
    icon: "antd:CheckCircleOutlined",
    patch: {
      label: "Yes / No",
      optionType: "button",
      buttonStyle: "solid",
      options: [
        { label: "Yes", value: "yes" },
        { label: "No", value: "no" },
      ],
    },
  },
  {
    id: "builtin-priority",
    fieldType: "radio",
    name: "Priority",
    icon: "antd:TagOutlined",
    patch: {
      label: "Priority",
      optionType: "button",
      options: [
        { label: "Low", value: "low" },
        { label: "Medium", value: "medium" },
        { label: "High", value: "high" },
      ],
    },
  },
  {
    id: "builtin-gender",
    fieldType: "select",
    name: "Gender",
    icon: "antd:UserOutlined",
    patch: {
      label: "Gender",
      allowClear: true,
      placeholder: "Select…",
      options: [
        { label: "Female", value: "female" },
        { label: "Male", value: "male" },
        { label: "Other", value: "other" },
      ],
    },
  },
  {
    id: "builtin-country",
    fieldType: "select",
    name: "Country",
    icon: "antd:GlobalOutlined",
    patch: {
      label: "Country",
      showSearch: true,
      allowClear: true,
      placeholder: "Select a country",
    },
  },
  {
    id: "builtin-tags",
    fieldType: "select",
    name: "Tags",
    icon: "antd:TagOutlined",
    patch: {
      label: "Tags",
      tags: true,
      allowClear: true,
      maxTagCount: "responsive",
      placeholder: "Add tags",
    },
  },

  // ── Booleans ──────────────────────────────────────────────────────────
  {
    id: "builtin-toggle",
    fieldType: "switch",
    name: "Toggle",
    icon: "antd:CheckCircleOutlined",
    patch: { label: "Enabled", checkedChildren: "On", unCheckedChildren: "Off" },
  },
  {
    id: "builtin-agree-terms",
    fieldType: "checkbox",
    name: "Agree to terms",
    icon: "antd:CheckCircleOutlined",
    patch: { label: "I agree to the terms and conditions", required: true },
  },

  // ── Upload ────────────────────────────────────────────────────────────
  {
    id: "builtin-avatar",
    fieldType: "upload",
    name: "Avatar",
    icon: "antd:UserOutlined",
    patch: { label: "Avatar", listType: "picture-card", maxCount: 1, accept: "image/*" },
  },
  {
    id: "builtin-file-dragger",
    fieldType: "upload",
    name: "File dropzone",
    icon: "antd:LinkOutlined",
    patch: { label: "Attachments", dragger: true, listType: "text", multiple: true },
  },
  {
    id: "builtin-image-gallery",
    fieldType: "upload",
    name: "Image gallery",
    icon: "antd:EyeOutlined",
    patch: { label: "Photos", listType: "picture", multiple: true, accept: "image/*" },
  },

  // ── Misc ──────────────────────────────────────────────────────────────
  {
    id: "builtin-rating",
    fieldType: "rate",
    name: "Rating",
    icon: "antd:CheckCircleOutlined",
    patch: { label: "Rating", count: 5, allowHalf: true, allowClear: true },
  },
  {
    id: "builtin-slider",
    fieldType: "slider",
    name: "Slider (0–100)",
    icon: "antd:PercentageOutlined",
    patch: { label: "Value", min: 0, max: 100, step: 1 },
  },
  {
    id: "builtin-color",
    fieldType: "color",
    name: "Color",
    icon: "antd:EditOutlined",
    patch: { label: "Color" },
  },
];
