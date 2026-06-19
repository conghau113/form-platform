import { Form } from "antd";
import type { ComponentProps, ReactNode } from "react";
import { createContext, useContext } from "react";

/** antd `Form.Item` label overrides supplied by an enclosing `form-layout` container.
 *  `undefined` at the form root, where the `<Form>` props already apply. */
export interface ItemLayout {
  layout?: "horizontal" | "vertical" | "inline";
  labelCol?: { span?: number; offset?: number };
  wrapperCol?: { span?: number; offset?: number };
  labelAlign?: "left" | "right";
  colon?: boolean;
}

const LayoutContext = createContext<ItemLayout | undefined>(undefined);

/** Expose a `form-layout` region's label props to descendant Form.Items, MERGING over any
 *  enclosing region so a nested `form-layout` inherits whatever it doesn't itself set. */
export function LayoutProvider({ value, children }: { value: ItemLayout; children: ReactNode }) {
  const parent = useContext(LayoutContext);
  const merged: ItemLayout = { ...parent };
  for (const key of ["layout", "labelCol", "wrapperCol", "labelAlign", "colon"] as const) {
    const v = value[key];
    if (v !== undefined) (merged as Record<string, unknown>)[key] = v;
  }
  return <LayoutContext.Provider value={merged}>{children}</LayoutContext.Provider>;
}

/** A `Form.Item` that first applies the enclosing `form-layout` overrides (if any), then
 *  the field's own props — so a field's `decoratorProps` always win over the region. antd's
 *  per-item `layout` accepts only horizontal/vertical, so "inline" maps to horizontal (the
 *  labelCol still puts the label beside the control). With no enclosing region this is a
 *  plain `Form.Item`, so the runtime stays byte-for-byte unchanged. */
export function LayoutFormItem(props: ComponentProps<typeof Form.Item>) {
  const ctx = useContext(LayoutContext);
  if (!ctx) return <Form.Item {...props} />;
  const itemLayout = ctx.layout === "inline" ? "horizontal" : ctx.layout;
  return (
    <Form.Item
      layout={itemLayout}
      labelCol={ctx.labelCol}
      wrapperCol={ctx.wrapperCol}
      labelAlign={ctx.labelAlign}
      colon={ctx.colon}
      {...props}
    />
  );
}
