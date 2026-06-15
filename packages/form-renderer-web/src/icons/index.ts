// Side-effect: register the built-in `antd:` namespace on import. Anyone importing the
// icon API (or the package barrel) gets the default glyphs resolved automatically.
import "./defaultIcons.js";

export { BUILTIN_ICON_TOKENS } from "./defaultIcons.js";
export { Icon, resolveIconNode } from "./Icon.js";
export {
  type IconComponent,
  type IconNamespaceResolver,
  registerIcon,
  registerIconNamespace,
  registerIcons,
  resolveIcon,
} from "./registry.js";
