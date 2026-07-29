import type { DataSourceOption, EffectMap, ReactionOption } from "@org/form-core";
import type { FieldNode, LeafField, TreeOption } from "@org/form-schema";
import type { DatePicker, TimePicker } from "antd";
import type React from "react";

export type Values = Record<string, unknown>;

/** antd Col sizing — either a fixed `span` or per-breakpoint widths. */
export type ColSpanProps = {
  span?: number;
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
};

export type DateValue = React.ComponentProps<typeof DatePicker>["value"];
export type TimeValue = React.ComponentProps<typeof TimePicker>["value"];
export type DateRangeValue = React.ComponentProps<typeof DatePicker.RangePicker>["value"];
export type TimeRangeValue = React.ComponentProps<typeof TimePicker.RangePicker>["value"];
export type SelectValue = string | number | Array<string | number> | undefined;
export type SelectField = Extract<LeafField, { type: "select" }>;
export type CheckboxGroupField = Extract<LeafField, { type: "checkbox-group" }>;
export type CascaderField = Extract<LeafField, { type: "cascader" }>;
export type TreeSelectField = Extract<LeafField, { type: "tree-select" }>;
/** Record picker. It sources RECORDS (not options) from a `dataSource`, so it is
 *  deliberately NOT part of `OptionSourced` — no static options, no options override. */
export type LookupField = Extract<LeafField, { type: "lookup" }>;
/** A field that sources options from static `options` or a remote `dataSource`. */
export type OptionSourced = SelectField | CheckboxGroupField | CascaderField | TreeSelectField;
export type OptionList =
  | ReactionOption[]
  | DataSourceOption[]
  | TreeOption[]
  | { label: string; value: string | number }[];

export function isOptionSourced(node: LeafField): node is OptionSourced {
  return (
    node.type === "select" ||
    node.type === "checkbox-group" ||
    node.type === "cascader" ||
    node.type === "tree-select"
  );
}

/** Leaf types whose antd control honors a `readOnly` prop (non-interactive, not greyed).
 *  Other types have no readOnly mode and render through FieldPreview instead. */
export const READONLY_INPUT_TYPES = new Set<LeafField["type"]>([
  "text",
  "textarea",
  "password",
  "number",
]);

/** The reactive scope a node renders in: the MERGED values it sees (outer form values
 *  plus, inside an array row, that row's own values) and the EffectMap computed against
 *  them. Top-level renders carry no scope and fall back to the form's own values/effects. */
export type Scope = { values: Record<string, unknown>; effects: EffectMap };

export type RenderNodeOpts = {
  hideLabel?: boolean;
  bare?: boolean;
  span?: ColSpanProps;
  path?: number[];
  /** Row scope for fields rendered inside an array row (per-row linkage). */
  scope?: Scope;
};

/** How `ArrayFieldSection` calls back into the renderer for a nested node. Array rows are
 *  not canonical authoring targets, so it never passes `path` — those renders stay
 *  unwrapped by `nodeWrapper`. */
export type RenderNode = (
  node: FieldNode,
  namePrefix: string,
  opts?: RenderNodeOpts,
) => React.ReactNode;
