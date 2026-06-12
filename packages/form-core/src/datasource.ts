import type { LeafField } from "@org/form-schema";

/** The `dataSource` config of a select field (the contract owns the shape). */
export type SelectDataSource = NonNullable<Extract<LeafField, { type: "select" }>["dataSource"]>;

/** A normalized option ready for any renderer's select control. */
export interface DataSourceOption {
  label: string;
  value: string | number;
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

/**
 * Fetch and normalize remote select options. Maps each row via the dataSource's
 * `labelKey`/`valueKey`. Throws on a non-ok response so callers (react-query on
 * web, etc.) can surface an error state. The fetch impl is injectable for tests
 * and non-DOM environments.
 */
export async function fetchDataSourceOptions(
  ds: SelectDataSource,
  values: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<DataSourceOption[]> {
  const res = await fetchImpl(buildDataSourceUrl(ds, values));
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    label: String(row[ds.labelKey]),
    value: row[ds.valueKey] as string | number,
  }));
}
