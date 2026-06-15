import type { ReactionOption } from "@org/form-core";
import { Checkbox, Typography } from "antd";
import type { CheckboxGroupField } from "../internal/control-types.js";
import { useRemoteOptions } from "./useRemoteOptions.js";

/** A group of checkboxes whose options may come from a remote dataSource. Value is an
 *  array of the chosen option values. Mirrors `SelectControl`'s option resolution. */
export function CheckboxGroupControl(props: {
  node: CheckboxGroupField;
  value: Array<string | number> | undefined;
  disabled?: boolean;
  onChange: (v: unknown) => void;
  depValues?: Record<string, unknown>;
  optionsOverride?: ReactionOption[];
}) {
  const { node, value, disabled, onChange, depValues = {}, optionsOverride } = props;
  const { options, isFetching, isError, error, ready, missing } = useRemoteOptions(
    node,
    depValues,
    optionsOverride,
  );

  if (!ready)
    return <Typography.Text type="secondary">Select {missing.join(", ")} first</Typography.Text>;
  if (isError) return <Typography.Text type="danger">{(error as Error).message}</Typography.Text>;
  if (isFetching) return <Typography.Text type="secondary">Loading…</Typography.Text>;

  // antd's Checkbox.Group has no `id` prop, so the Form.Item label stays unassociated.
  // It also has no `direction` prop: stacking is done by flexing the group container,
  // which still lays out the option-driven checkboxes correctly.
  const style =
    node.direction === "vertical"
      ? { display: "flex", flexDirection: "column" as const, rowGap: 4 }
      : undefined;
  return (
    <Checkbox.Group
      value={value}
      disabled={disabled}
      options={options ?? []}
      style={style}
      onChange={onChange}
    />
  );
}
