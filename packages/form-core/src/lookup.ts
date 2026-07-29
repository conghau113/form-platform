import type { LeafField } from "@org/form-schema";
import type { DataSourceRow } from "./datasource.js";

/** The contract's record-picker field (the contract owns the shape). */
export type LookupField = Extract<LeafField, { type: "lookup" }>;
export type LookupColumn = NonNullable<LookupField["columns"]>[number];
export type LookupMapping = NonNullable<LookupField["mapping"]>[number];

/**
 * The columns the picker table shows. Authored `columns` win; absent, they are DERIVED
 * from the keys the field already talks about — the dataSource's label/value keys plus
 * every mapped response key — so a lookup is usable with no column authoring at all.
 * Deduped, in that order; a derived column titles itself with its own key.
 */
export function lookupColumns(node: LookupField): LookupColumn[] {
  if (node.columns?.length) return node.columns;
  const keys: string[] = [];
  const add = (key: string | undefined) => {
    if (key && !keys.includes(key)) keys.push(key);
  };
  add(node.dataSource?.labelKey);
  add(node.dataSource?.valueKey);
  for (const m of node.mapping ?? []) add(m.from);
  return keys.map((key) => ({ key, title: key }));
}

/**
 * The values Apply writes into OTHER fields, keyed by target field name. Every mapping
 * is assigned even when the picked row lacks that key (the value becomes `undefined`,
 * which CLEARS the target): the mapping owns its target fields, so a row that carries
 * no address must not leave the previous record's address behind.
 */
export function lookupPatch(
  row: DataSourceRow,
  mapping: readonly LookupMapping[] | undefined,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const m of mapping ?? []) patch[m.to] = row[m.from];
  return patch;
}

/**
 * Client-side filter of the picker table: keeps rows where any DISPLAYED column contains
 * the query, case-insensitively. An empty query keeps everything. Platform-agnostic —
 * the whole list is already in memory (the dataSource returns it in one request).
 */
export function filterLookupRows(
  rows: readonly DataSourceRow[],
  columns: readonly LookupColumn[],
  query: string,
): DataSourceRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((row) =>
    columns.some((col) => {
      const cell = row[col.key];
      return cell != null && String(cell).toLowerCase().includes(q);
    }),
  );
}
