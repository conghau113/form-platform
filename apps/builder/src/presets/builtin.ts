import type { Preset } from "@org/form-schema";

/**
 * Built-in presets ship with the builder (they are NOT persisted via the api — that store
 * holds user presets only). This is a minimal representative seed that exercises the
 * icon + patch path; the full library is delivered in P3.
 */
export const BUILTIN_PRESETS: Preset[] = [
  {
    id: "builtin-search",
    fieldType: "text",
    name: "Search input",
    icon: "antd:SearchOutlined",
    patch: { prefixIcon: "antd:SearchOutlined", placeholder: "Search" },
  },
  {
    id: "builtin-email",
    fieldType: "text",
    name: "Email",
    icon: "antd:MailOutlined",
    patch: { prefixIcon: "antd:MailOutlined", placeholder: "name@example.com" },
  },
];
