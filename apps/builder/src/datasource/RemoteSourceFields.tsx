import type { LeafField } from "@org/form-schema";
import { Button, Form, Input, InputNumber, Select, Space, Typography } from "antd";

/** The remote source shape every dataSource-backed leaf shares (`selectDataSourceSchema`). */
export type RemoteDataSource = NonNullable<Extract<LeafField, { type: "select" }>["dataSource"]>;
type Param = NonNullable<RemoteDataSource["params"]>[number];

/** The remote half of a dataSource: url + label/value keys (+ an optional children key
 *  for the tree-shaped types), a cache TTL, and the params editor that sends other
 *  fields' current values as query params. Shared by the option-sourced leaves
 *  (DataSourceEditor) and the record picker (LookupEditor), which differ only in what
 *  `setDs` writes alongside the dataSource. */
export function RemoteSourceFields({
  ds,
  setDs,
  sourceNames,
  showChildrenKey,
}: {
  ds: RemoteDataSource | undefined;
  /** Merge a partial into the current dataSource. The caller owns any sibling keys it
   *  must clear (an option-sourced leaf drops static `options`; a lookup has none). */
  setDs: (patch: Partial<RemoteDataSource>) => void;
  /** Other field names a param can read its value from. */
  sourceNames: string[];
  showChildrenKey?: boolean;
}) {
  // A legacy `dependsOn` surfaces as a single param row; editing params normalizes it away.
  const params: Param[] =
    ds?.params ?? (ds?.dependsOn ? [{ name: ds.dependsOn, from: ds.dependsOn }] : []);
  const setParams = (next: Param[]) =>
    setDs({ params: next.length ? next : undefined, dependsOn: undefined });
  const patchParam = (i: number, patch: Partial<Param>) =>
    setParams(params.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  return (
    <>
      <Form.Item label="URL">
        <Input value={ds?.url ?? ""} onChange={(e) => setDs({ url: e.target.value })} />
      </Form.Item>
      <Space>
        <Form.Item label="Khóa nhãn">
          <Input value={ds?.labelKey ?? ""} onChange={(e) => setDs({ labelKey: e.target.value })} />
        </Form.Item>
        <Form.Item label="Khóa giá trị">
          <Input value={ds?.valueKey ?? ""} onChange={(e) => setDs({ valueKey: e.target.value })} />
        </Form.Item>
      </Space>
      {showChildrenKey && (
        <Form.Item
          label="Khóa con (cây)"
          tooltip="Trường phản hồi chứa các hàng con của mỗi hàng; ánh xạ đệ quy thành cây."
        >
          <Input
            placeholder="vd children"
            value={ds?.childrenKey ?? ""}
            onChange={(e) => setDs({ childrenKey: e.target.value || undefined })}
          />
        </Form.Item>
      )}
      <Form.Item label="TTL bộ nhớ đệm (ms)">
        <InputNumber
          style={{ width: "100%" }}
          min={0}
          value={ds?.ttlMs ?? null}
          onChange={(v) => setDs({ ttlMs: v ?? undefined })}
        />
      </Form.Item>

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Tham số — gửi giá trị hiện tại của trường khác làm tham số truy vấn.
      </Typography.Text>
      {params.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: param rows have no stable id; index is fine for this small editor
        <Space key={i} align="end" style={{ display: "flex", marginTop: 8 }}>
          <Form.Item label="Tham số" style={{ marginBottom: 0 }}>
            <Input
              placeholder="tên truy vấn"
              value={p.name}
              onChange={(e) => patchParam(i, { name: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="Từ trường" style={{ marginBottom: 0 }}>
            <Select
              style={{ width: 130 }}
              value={p.from || undefined}
              options={sourceNames.map((n) => ({ label: n, value: n }))}
              onChange={(from) => patchParam(i, { from })}
            />
          </Form.Item>
          <Button size="small" onClick={() => setParams(params.filter((_, idx) => idx !== i))}>
            Xóa
          </Button>
        </Space>
      ))}
      <div style={{ marginTop: 8 }}>
        <Button
          size="small"
          onClick={() => setParams([...params, { name: "", from: sourceNames[0] ?? "" }])}
        >
          Thêm tham số
        </Button>
      </div>
    </>
  );
}
