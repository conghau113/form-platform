import type { ReactionOption } from "@org/form-core";
import { Cascader } from "antd";
import type React from "react";
import type { CascaderField } from "../internal/control-types.js";
import { useRemoteOptions } from "./useRemoteOptions.js";

/** Hierarchical path choice. `{label, value, children}` is antd Cascader's native option
 *  shape, so static trees, remote trees (dataSource + childrenKey) and flat reaction
 *  overrides all pass straight through. Mirrors `SelectControl`'s option resolution. */
export function CascaderControl(props: {
  node: CascaderField;
  value: Array<string | number> | undefined;
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
    <Cascader
      id={id}
      style={{ width: "100%" }}
      value={value}
      disabled={disabled}
      options={options ?? []}
      status={isError ? "error" : undefined}
      notFoundContent={notFoundContent}
      onChange={(v) => onChange(v)}
    />
  );
}
