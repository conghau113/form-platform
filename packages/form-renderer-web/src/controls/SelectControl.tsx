import type { ReactionOption } from "@org/form-core";
import { Select } from "antd";
import type React from "react";
import type { SelectField, SelectValue } from "../internal/control-types.js";
import { useRemoteOptions } from "./useRemoteOptions.js";

/** A select whose options may come from a remote dataSource. Only the antd control +
 *  loading/error UI are web-specific; the fetch lives in `useRemoteOptions`. */
export function SelectControl(props: {
  node: SelectField;
  value: SelectValue;
  disabled?: boolean;
  onChange: (v: unknown) => void;
  /** Current values of every field this select's dataSource depends on
   *  (`dependsOn` + each `params[].from`), keyed by field name. */
  depValues?: Record<string, unknown>;
  /** Options injected by a reaction `effect: "options"` — overrides static/remote. */
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

  // `tags` mode (free typing) wins over `multiple`; both yield an array value.
  const mode = node.tags ? "tags" : node.multiple ? "multiple" : undefined;

  return (
    <Select
      id={id}
      style={{ width: "100%" }}
      value={value}
      disabled={disabled}
      mode={mode}
      showSearch={node.showSearch}
      allowClear={node.allowClear}
      placeholder={node.placeholder}
      maxTagCount={node.maxTagCount}
      size={node.size}
      variant={node.variant}
      options={options ?? []}
      loading={isFetching}
      status={isError ? "error" : undefined}
      notFoundContent={notFoundContent}
      onChange={onChange}
    />
  );
}
