import type { StatusCatalogEntry, StatusKind, WorkflowNode } from "@org/workflow-schema";

/**
 * Pure resolution of a node's presentation from the status catalog (WE4). No React / xyflow here so
 * it is unit-testable without a DOM. The catalog (project master data) is the source of truth when
 * the node's `statusCode` resolves; otherwise the node's own frozen `kind`/`status` snapshot is the
 * fallback (the linked-field W4 pattern — a deleted catalog entry never blanks a saved node).
 *
 * Colour is NEVER stored in the workflow contract: it derives from the entry's optional custom
 * `color`, else the kind default.
 */

/** Default colour per engine kind (used when a catalog entry has no custom `color`). */
export const KIND_COLOR: Record<StatusKind, string> = {
  start: "#1677ff", // blue — entry point
  normal: "#8c8c8c", // neutral grey — in progress
  end: "#52c41a", // green — terminal / done
};

/** Human label per kind, for the picker/legend. */
export const KIND_LABEL: Record<StatusKind, string> = {
  start: "Bắt đầu",
  normal: "Thường",
  end: "Kết thúc",
};

/** A curated palette of common status colours (antd's vivid preset hues) the catalog manager offers
 *  as one-click swatches, so most users never need the raw colour picker. */
export const STATUS_PALETTE: readonly string[] = [
  "#f5222d", // red
  "#fa541c", // volcano
  "#fa8c16", // orange
  "#faad14", // gold
  "#a0d911", // lime
  "#52c41a", // green
  "#13c2c2", // cyan
  "#1677ff", // blue
  "#2f54eb", // geekblue
  "#722ed1", // purple
  "#eb2f96", // magenta
  "#8c8c8c", // grey
];

export interface ResolvedStatusStyle {
  /** Display label: the catalog entry's label, else the node's frozen `status` snapshot. */
  label: string;
  /** Resolved colour: catalog custom colour → kind default. */
  color: string;
  /** Effective kind: catalog entry's kind → node's snapshot kind → `"normal"`. */
  kind: StatusKind;
  /** `true` when the node references a `statusCode` not present in the catalog (deleted/out-of-scope). */
  missing: boolean;
}

/** Index a catalog list by `code` for O(1) lookups across many nodes. */
export function indexStatusCatalog(
  catalog: readonly StatusCatalogEntry[],
): ReadonlyMap<string, StatusCatalogEntry> {
  return new Map(catalog.map((e) => [e.code, e]));
}

/** Resolve a node's label/colour/kind against an indexed catalog (build it with {@link indexStatusCatalog}). */
export function resolveStatusStyle(
  node: Pick<WorkflowNode, "status" | "kind" | "statusCode">,
  byCode: ReadonlyMap<string, StatusCatalogEntry>,
): ResolvedStatusStyle {
  const entry = node.statusCode ? byCode.get(node.statusCode) : undefined;
  const missing = node.statusCode != null && entry === undefined;
  const kind: StatusKind = entry?.kind ?? node.kind ?? "normal";
  return {
    label: entry?.label ?? node.status,
    color: entry?.color ?? KIND_COLOR[kind],
    kind,
    missing,
  };
}
