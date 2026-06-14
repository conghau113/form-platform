import type { ReactionOption } from "@org/form-core";
import type { LeafField } from "@org/form-schema";
import { Typography } from "antd";
import { previewText } from "./previewText.js";

/** Plain-text read view of a leaf's value (review / readPretty mode). */
export function FieldPreview(props: {
  node: LeafField;
  value: unknown;
  optionsOverride?: ReactionOption[];
}) {
  return (
    <Typography.Text>{previewText(props.node, props.value, props.optionsOverride)}</Typography.Text>
  );
}
