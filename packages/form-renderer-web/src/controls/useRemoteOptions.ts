import {
  type DataSourceOption,
  dataSourceDeps,
  dataSourceReady,
  fetchDataSourceOptions,
  type ReactionOption,
} from "@org/form-core";
import { useQuery } from "@tanstack/react-query";
import type { OptionList, OptionSourced } from "../internal/control-types.js";

/** Resolve the option list for a select/checkbox-group, fetching a remote `dataSource`
 *  via react-query when present. Fetching + option mapping live in form-core so native
 *  reuses them; this hook only wires react-query + the dependency gating. Shared by
 *  `SelectControl` and `CheckboxGroupControl`. */
export function useRemoteOptions(
  node: OptionSourced,
  depValues: Record<string, unknown>,
  optionsOverride?: ReactionOption[],
): {
  options: OptionList | undefined;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  ready: boolean;
  missing: string[];
} {
  const ds = node.dataSource;
  // A dependent control waits until EVERY field it depends on has a value before fetching.
  const deps = ds ? dataSourceDeps(ds) : [];
  const ready = !ds || dataSourceReady(ds, depValues);
  const missing = deps.filter((field) => depValues[field] == null || depValues[field] === "");

  const query = useQuery<DataSourceOption[]>({
    // Keyed on the url + every dep value, so changing any parent refetches.
    queryKey: ["form-datasource", ds?.url, ...deps.map((field) => depValues[field] ?? null)],
    enabled: !!ds && ready,
    // ds is defined whenever the query is enabled.
    queryFn: () => fetchDataSourceOptions(ds as NonNullable<typeof ds>, depValues),
    // Cache fetched options for ttlMs (default 0 = always fresh).
    staleTime: ds?.ttlMs ?? 0,
  });

  // A reaction `options` effect wins; otherwise static options pass straight
  // through and remote options come from the query.
  const options = optionsOverride ?? (ds ? query.data : node.options);
  return {
    options,
    isFetching: !!ds && query.isFetching,
    isError: query.isError,
    error: query.error,
    ready,
    missing,
  };
}
