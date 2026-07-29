import type { LeafField } from "@org/form-schema";

/** The `dataSource` config of a select field (the contract owns the shape). */
export type SelectDataSource = NonNullable<Extract<LeafField, { type: "select" }>["dataSource"]>;

/** A normalized option ready for any renderer's select control. `children` is
 *  present only when the dataSource declares a `childrenKey` (tree-shaped
 *  sources for cascader / tree-select); flat consumers never see it. */
export interface DataSourceOption {
  label: string;
  value: string | number;
  children?: DataSourceOption[];
}

/** A value is "present" for dependency purposes when it isn't nullish or empty. */
function isPresent(value: unknown): boolean {
  return value != null && value !== "";
}

/**
 * Every field name this dataSource reads, deduped: the level-1 `dependsOn` parent
 * plus each level-2 `params[].from` source. The order is `dependsOn` first, then
 * params in declaration order — renderers use it to build a stable query key.
 */
export function dataSourceDeps(ds: SelectDataSource): string[] {
  const deps: string[] = [];
  if (ds.dependsOn) deps.push(ds.dependsOn);
  for (const p of ds.params ?? []) {
    if (!deps.includes(p.from)) deps.push(p.from);
  }
  return deps;
}

/**
 * True when every field this dataSource depends on has a present value, so the
 * request can fire. A dataSource with no deps is always ready.
 */
export function dataSourceReady(ds: SelectDataSource, values: Record<string, unknown>): boolean {
  return dataSourceDeps(ds).every((field) => isPresent(values[field]));
}

/**
 * Build the request URL for a select's dataSource. The level-1 `dependsOn` parent
 * is sent as a query param NAMED AFTER the field (dependsOn "country" -> `?country=VN`).
 * Each level-2 `params[]` entry sends `name=<value of field `from`>`. Existing query
 * strings on the configured url are preserved. Platform-agnostic — shared by web + native.
 */
export function buildDataSourceUrl(ds: SelectDataSource, values: Record<string, unknown>): string {
  if (!ds.dependsOn && !ds.params?.length) return ds.url;
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(ds.url);
  const url = new URL(ds.url, "http://_relative_base_");
  if (ds.dependsOn) url.searchParams.set(ds.dependsOn, String(values[ds.dependsOn]));
  for (const p of ds.params ?? []) {
    url.searchParams.set(p.name, String(values[p.from]));
  }
  // Strip the synthetic base for relative urls; keep absolute urls intact.
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
}

/** Map one response row to an option; with `childrenKey` set, child rows map
 *  recursively through the same labelKey/valueKey to build a tree. */
function mapRow(row: Record<string, unknown>, ds: SelectDataSource): DataSourceOption {
  const option: DataSourceOption = {
    label: String(row[ds.labelKey]),
    value: row[ds.valueKey] as string | number,
  };
  if (ds.childrenKey) {
    const kids = row[ds.childrenKey];
    if (Array.isArray(kids)) {
      option.children = kids.map((kid) => mapRow(kid as Record<string, unknown>, ds));
    }
  }
  return option;
}

/** One raw response row, with every key the endpoint returned. */
export type DataSourceRow = Record<string, unknown>;

/**
 * Fetch the raw rows of a dataSource, keeping EVERY key of each row. Option consumers
 * only need label/value (see `fetchDataSourceOptions`), but a record picker (`lookup`)
 * maps other keys of the picked row onto other fields, so it needs the rows untouched.
 * Throws on a non-ok response so callers can surface an error state.
 */
export async function fetchDataSourceRows(
  ds: SelectDataSource,
  values: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<DataSourceRow[]> {
  const res = await fetchImpl(buildDataSourceUrl(ds, values));
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as DataSourceRow[];
}

/**
 * Fetch and normalize remote select options. Maps each row via the dataSource's
 * `labelKey`/`valueKey`; a `childrenKey` maps rows recursively into a tree (for
 * cascader / tree-select). Throws on a non-ok response so callers (react-query
 * on web, etc.) can surface an error state. The fetch impl is injectable for
 * tests and non-DOM environments.
 */
export async function fetchDataSourceOptions(
  ds: SelectDataSource,
  values: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<DataSourceOption[]> {
  const rows = await fetchDataSourceRows(ds, values, fetchImpl);
  return rows.map((row) => mapRow(row, ds));
}
