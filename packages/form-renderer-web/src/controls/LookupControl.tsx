import {
  type DataSourceRow,
  dataSourceDeps,
  dataSourceReady,
  fetchDataSourceRows,
  filterLookupRows,
  lookupColumns,
  lookupPatch,
} from "@org/form-core";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Modal, Space, Table, Typography } from "antd";
import { useState } from "react";
import type { LookupField } from "../internal/control-types.js";
import { useFetcher } from "../internal/FetcherContext.js";

/** Record picker: a read-only box plus a button that opens a modal listing the records of
 *  the field's `dataSource`. Picking a row and applying it stores the row's `valueKey` in
 *  this field (`onChange`) and fills the mapped fields (`onApply`) in one go.
 *
 *  Fetching, column derivation, filtering and the Apply patch all live in form-core so a
 *  native renderer reuses them; this control only wires react-query + the antd surface.
 *  Rows load lazily — the request fires the first time the modal opens, never on mount. */
export function LookupControl(props: {
  node: LookupField;
  value: unknown;
  disabled?: boolean;
  onChange: (v: unknown) => void;
  /** Write the mapped values into the OTHER fields named by `mapping[].to`. */
  onApply?: (patch: Record<string, unknown>) => void;
  depValues?: Record<string, unknown>;
  id?: string;
}) {
  const { node, value, disabled, onChange, onApply, depValues = {}, id } = props;
  const ds = node.dataSource;
  const fetcher = useFetcher();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<DataSourceRow | undefined>();
  // The label of the record picked in THIS session. After a reload the raw stored value
  // shows instead (no extra request is made just to resolve a display string).
  const [label, setLabel] = useState<string | undefined>();

  const columns = lookupColumns(node);
  const deps = ds ? dataSourceDeps(ds) : [];
  const ready = !!ds && dataSourceReady(ds, depValues);
  const missing = deps.filter((field) => depValues[field] == null || depValues[field] === "");
  const configured = !!ds?.url;

  const rows = useQuery<DataSourceRow[]>({
    // Keyed on the url + every dep value, mirroring useRemoteOptions. The fetcher is
    // intentionally not part of the key.
    queryKey: ["form-lookup", ds?.url, ...deps.map((field) => depValues[field] ?? null)],
    enabled: open && configured && ready,
    queryFn: () => fetchDataSourceRows(ds as NonNullable<typeof ds>, depValues, fetcher),
    staleTime: ds?.ttlMs ?? 0,
  });

  const close = () => {
    setOpen(false);
    setQuery("");
    setPicked(undefined);
  };

  const apply = () => {
    if (!picked || !ds) return close();
    onChange(picked[ds.valueKey]);
    const shown = picked[ds.labelKey];
    setLabel(shown == null ? undefined : String(shown));
    onApply?.(lookupPatch(picked, node.mapping));
    close();
  };

  const display = label ?? (value == null || value === "" ? "" : String(value));
  const visible = filterLookupRows(rows.data ?? [], columns, query);

  let empty = "No records";
  if (!ready) empty = `Select ${missing.join(", ")} first`;
  else if (rows.isError) empty = (rows.error as Error).message;

  return (
    <>
      <Space.Compact style={{ width: "100%" }}>
        <Input
          id={id}
          readOnly
          value={display}
          placeholder={node.placeholder}
          disabled={disabled}
          size={node.size}
          variant={node.variant}
        />
        {node.allowClear && (
          <Button
            size={node.size}
            disabled={disabled || display === ""}
            onClick={() => {
              setLabel(undefined);
              onChange(undefined);
            }}
          >
            Clear
          </Button>
        )}
        <Button
          type="primary"
          size={node.size}
          disabled={disabled || !configured}
          onClick={() => setOpen(true)}
        >
          Select…
        </Button>
      </Space.Compact>
      {!configured && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          No data source configured
        </Typography.Text>
      )}
      <Modal
        open={open}
        title={node.label}
        okText="Apply"
        cancelText="Cancel"
        okButtonProps={{ disabled: !picked }}
        onOk={apply}
        onCancel={close}
        width={720}
      >
        <Input.Search
          allowClear
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <Table
          size="small"
          rowKey={(row) => String(ds ? row[ds.valueKey] : "")}
          loading={rows.isFetching}
          dataSource={visible}
          columns={columns.map((col) => ({ key: col.key, title: col.title, dataIndex: col.key }))}
          pagination={false}
          scroll={{ y: 320 }}
          locale={{ emptyText: empty }}
          rowSelection={{
            type: "radio",
            selectedRowKeys: picked && ds ? [String(picked[ds.valueKey])] : [],
            onChange: (_keys, selected) => setPicked(selected[0]),
          }}
          onRow={(row) => ({ onClick: () => setPicked(row) })}
        />
      </Modal>
    </>
  );
}
