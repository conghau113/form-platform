/** Property-panel section identity + search keywords (G3). The section bodies are built in
 *  FieldForm; this map keeps the searchable vocabulary (and labels) in one testable place so
 *  searching e.g. "role" surfaces Permissions even though that word is not the section label.
 *  Keys match the Collapse item keys in FieldForm. */
export const PANEL_SECTIONS = [
  "basic",
  "props",
  "validation",
  "layout",
  "logic",
  "permissions",
] as const;

export type PanelSectionKey = (typeof PANEL_SECTIONS)[number];

export const SECTION_LABELS: Record<PanelSectionKey, string> = {
  basic: "Basic",
  props: "Properties",
  validation: "Validation",
  layout: "Layout",
  logic: "Logic (visibility & reactions)",
  permissions: "Permissions",
};

export const SECTION_KEYWORDS: Record<PanelSectionKey, string[]> = {
  basic: [
    "name",
    "label",
    "key",
    "required",
    "help",
    "tooltip",
    "extra",
    "hint",
    "pattern",
    "disabled",
    "read-only",
    "readonly",
    "read-pretty",
    "feedback",
  ],
  props: [
    "properties",
    "placeholder",
    "options",
    "data source",
    "default",
    "default value",
    "icon",
    "prefix",
    "suffix",
    "min",
    "max",
    "step",
    "variant",
    "items",
  ],
  validation: ["validation", "rule", "regex", "pattern", "min", "max", "message", "required"],
  layout: ["layout", "colspan", "column", "responsive", "width", "mobile", "hide", "grid"],
  logic: ["logic", "visibility", "visible", "show", "condition", "when", "reaction"],
  permissions: ["permissions", "permission", "role", "rbac", "view", "edit", "access"],
};

/** True when a section matches a (already-lowercased, trimmed) query — by label or keyword. */
export function sectionMatches(key: PanelSectionKey, query: string): boolean {
  if (!query) return true;
  if (SECTION_LABELS[key].toLowerCase().includes(query)) return true;
  return SECTION_KEYWORDS[key].some((k) => k.includes(query));
}
