import type { ReactionOption } from "@org/form-core";
import { TreeSelect } from "antd";
import type React from "react";
import type { SelectValue, TreeSelectField } from "../internal/control-types.js";
import { useRemoteOptions } from "./useRemoteOptions.js";

/** Tree dropdown choice; value is the chosen node's value (array when `multiple`).
 *  The explicit `fieldNames` mapping is load-bearing: TreeSelect's default display
 *  field is `title`, while the contract's tree options carry `label`. */
export function TreeSelectControl(props: {
  node: TreeSelectField;
  value: SelectValue;
  disabled?: boolean;
  onChange: (v: unknown) => void;
  depValues?: Record<string, unknown>;
  optionsOverride?: ReactionOption[];
  id?: string;
}) {
  const { node, value, disabled, onChange, depValues = {}, optionsOverride, id } = props;
  const { options, isFetching, isError, error, ready, missing } = useRemoteOptions(
    node,
    depValues,
    optionsOverride,
  );

  let notFoundContent: React.ReactNode;
  if (!ready) notFoundContent = `Select ${missing.join(", ")} first`;
  else if (isError) notFoundContent = (error as Error).message;
  else if (isFetching) notFoundContent = "Loading…";

  return (
    <TreeSelect
      id={id}
      style={{ width: "100%" }}
      value={value}
      disabled={disabled}
      multiple={node.multiple}
      treeData={options ?? []}
      fieldNames={{ label: "label", value: "value", children: "children" }}
      status={isError ? "error" : undefined}
      notFoundContent={notFoundContent}
      onChange={onChange}
    />
  );
}
