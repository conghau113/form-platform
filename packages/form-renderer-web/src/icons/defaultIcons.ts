import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  EditOutlined,
  EnvironmentOutlined,
  EuroOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  LockOutlined,
  MailOutlined,
  NumberOutlined,
  PercentageOutlined,
  PhoneOutlined,
  SearchOutlined,
  TagOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { type IconComponent, registerIconNamespace } from "./registry.js";

/**
 * Built-in `antd:` namespace — a CURATED, form-relevant subset of `@ant-design/icons`
 * (named imports only, so the bundler tree-shakes everything else away). The registry is
 * open: apps register more tokens or a whole new namespace (e.g. `lucide:`) via
 * `registerIcon`/`registerIconNamespace` without touching the schema. `@ant-design/icons`
 * is a peer dependency — it travels with antd, which the renderer already requires.
 */
const ANTD_ICONS: Record<string, IconComponent> = {
  SearchOutlined,
  UserOutlined,
  MailOutlined,
  LockOutlined,
  PhoneOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  DollarOutlined,
  EuroOutlined,
  PercentageOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
  LinkOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  EditOutlined,
  TagOutlined,
  NumberOutlined,
};

/** Tokens shipped out of the box (e.g. `"antd:SearchOutlined"`) — handy for setter
 *  suggestion lists in the builder. */
export const BUILTIN_ICON_TOKENS: string[] = Object.keys(ANTD_ICONS).map((name) => `antd:${name}`);

registerIconNamespace("antd", (name) => ANTD_ICONS[name]);
