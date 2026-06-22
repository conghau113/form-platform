import { LAYOUT_CONTAINER_TYPES } from "./containers.js";
import { CURRENT_FORM_VERSION, type FieldNode } from "./schema.js";

/**
 * P0 — machine-readable field catalog.
 *
 * A flat, declarative description of every node `type` the contract supports, so
 * an agent / MCP tool can discover "what can I put in a form" WITHOUT parsing the
 * Zod union. This is metadata ABOUT the contract, not part of it — adding a field
 * type means adding an entry here (the drift test enforces parity).
 */

/** Authoring family a node belongs to (mirrors the builder palette taxonomy). */
export type FieldCategory = "input" | "array" | "layout" | "display";

/**
 * Shape of the runtime value a node contributes to the submitted object.
 * `none` = value-transparent (layout containers hoist their children) or
 * non-data (display). `object` = nested group of named children.
 */
export type FieldValueShape =
  | "string"
  | "number"
  | "boolean"
  | "string[]"
  | "object"
  | "object[]"
  | "none";

export interface FieldCapability {
  /** Discriminator literal used as `type` in the contract. */
  readonly type: FieldNode["type"];
  readonly category: FieldCategory;
  /** Runtime value shape this node contributes (see {@link FieldValueShape}). */
  readonly valueShape: FieldValueShape;
  /** True when the node holds an enumerated `options` list (or tree options). */
  readonly hasOptions: boolean;
  /** True when the node nests other nodes (layout containers + `array`). */
  readonly isContainer: boolean;
  /** One-line, machine-and-human readable description. */
  readonly summary: string;
}

const INPUT = (
  type: FieldNode["type"],
  valueShape: FieldValueShape,
  summary: string,
  hasOptions = false,
): FieldCapability => ({
  type,
  category: "input",
  valueShape,
  hasOptions,
  isContainer: false,
  summary,
});

const LAYOUT = (type: FieldNode["type"], summary: string): FieldCapability => ({
  type,
  category: "layout",
  valueShape: "none",
  hasOptions: false,
  isContainer: true,
  summary,
});

/** Every node type the contract supports, keyed by `type`. */
export const FIELD_CAPABILITIES: readonly FieldCapability[] = [
  // Inputs
  INPUT("text", "string", "Single-line text input."),
  INPUT("textarea", "string", "Multi-line text input."),
  INPUT("number", "number", "Numeric input with optional min/max/step and display format."),
  INPUT("password", "string", "Masked single-line text input."),
  INPUT("select", "string", "Dropdown picking one option (or many with multiple).", true),
  INPUT("radio", "string", "Choose exactly one option from a visible set.", true),
  INPUT("checkbox-group", "string[]", "Choose any number of options.", true),
  INPUT("checkbox", "boolean", "A single on/off checkbox."),
  INPUT("switch", "boolean", "A single on/off toggle."),
  INPUT("slider", "number", "Pick a number along a track."),
  INPUT("rate", "number", "Star/heart/like rating."),
  INPUT("color", "string", "Color picker, value as a color string."),
  INPUT("date", "string", "Single date (or week/month/quarter/year)."),
  INPUT("time", "string", "Single time-of-day."),
  INPUT("date-range", "string[]", "Start/end date pair."),
  INPUT("time-range", "string[]", "Start/end time pair."),
  INPUT("cascader", "string[]", "Pick a path through a hierarchy of options.", true),
  INPUT("tree-select", "string", "Pick from a tree of options (multiple → array).", true),
  INPUT("upload", "object[]", "File upload, value as a list of file descriptors."),
  // Arrays
  {
    type: "array",
    category: "array",
    valueShape: "object[]",
    hasOptions: false,
    isContainer: true,
    summary: "Repeatable list of rows; each row is an object of itemFields.",
  },
  // Layout containers (value-transparent: children hoist to the parent object)
  LAYOUT("group", "Logical grouping of children; values hoist to the parent."),
  LAYOUT("tabs", "Tabbed container; children are tab-pane nodes."),
  LAYOUT("tab-pane", "A single tab inside tabs."),
  LAYOUT("collapse", "Accordion container; children are collapse-panel nodes."),
  LAYOUT("collapse-panel", "A single panel inside collapse."),
  LAYOUT("card", "Bordered card grouping children."),
  LAYOUT("grid", "Responsive grid laying out children by colSpan."),
  LAYOUT("space", "Inline spacing container for children."),
  LAYOUT("steps", "Multi-step wizard; children are step nodes."),
  LAYOUT("step", "A single step inside steps."),
  LAYOUT("form-layout", "Scoped layout (orientation) wrapper around children."),
  // Displays
  {
    type: "display-text",
    category: "display",
    valueShape: "none",
    hasOptions: false,
    isContainer: false,
    summary: "Static rich/plain text; contributes no value.",
  },
];

/** All node `type` literals the contract supports. */
export const FIELD_TYPES: readonly FieldNode["type"][] = FIELD_CAPABILITIES.map((c) => c.type);

/** Lookup a capability descriptor by node type. */
export function capabilityOf(type: FieldNode["type"]): FieldCapability | undefined {
  return FIELD_CAPABILITIES.find((c) => c.type === type);
}

/**
 * The catalog as a single agent-facing payload: the contract version plus the
 * field list. This is what an MCP "list field types" tool returns.
 */
export function formCapabilities(): {
  formVersion: number;
  fields: readonly FieldCapability[];
} {
  return { formVersion: CURRENT_FORM_VERSION, fields: FIELD_CAPABILITIES };
}

/** Container/array type set, re-derived for the drift test (and consumers). */
export const CONTAINER_FIELD_TYPES: readonly FieldNode["type"][] = [
  ...LAYOUT_CONTAINER_TYPES,
  "array",
];
