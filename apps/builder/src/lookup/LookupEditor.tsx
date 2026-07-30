import type { LookupColumn, LookupField, LookupMapping } from "@org/form-core";
import { Button, Divider, Form, Input, Select, Space, Typography } from "antd";
import { type RemoteDataSource, RemoteSourceFields } from "../datasource";

/** Authoring UI for a record-picker field: WHERE the records come from (the shared remote
 *  dataSource block), WHICH columns the picker table shows, and WHAT the Apply button
 *  writes into other fields. Columns are optional — left empty the renderer derives them
 *  from the label/value keys plus every mapped response key. */
export function LookupEditor({
  field,
  sourceNames,
  targetNames,
  set,
}: {
  field: LookupField;
  /** Other field names a query param can read its value from (container siblings). */
  sourceNames: string[];
  /** Field names Apply can write into — the same scope reactions target. */
  targetNames: string[];
  set: (patch: Partial<LookupField>) => void;
}) {
  const ds = field.dataSource;
  // Unlike an option-sourced leaf there is no static-options branch to clear here.
  const setDs = (patch: Partial<RemoteDataSource>) =>
    set({ dataSource: { url: "", labelKey: "", valueKey: "", ...ds, ...patch } });

  const columns: LookupColumn[] = field.columns ?? [];
  const setColumns = (next: LookupColumn[]) => set({ columns: next.length ? next : undefined });
  const patchColumn = (i: number, patch: Partial<LookupColumn>) =>
    setColumns(columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  // A lookup already owns its own value (the picked row's valueKey), so it can never be
  // one of its own Apply targets — same exclusion ReactionsEditor makes.
  const targets = targetNames.filter((n) => n !== field.name);
  const mapping: LookupMapping[] = field.mapping ?? [];
  const setMapping = (next: LookupMapping[]) => set({ mapping: next.length ? next : undefined });
  const patchMapping = (i: number, patch: Partial<LookupMapping>) =>
    setMapping(mapping.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  return (
    <>
      <Divider orientation="left" plain>
        Nguồn bản ghi
      </Divider>
      <RemoteSourceFields ds={ds} setDs={setDs} sourceNames={sourceNames} />

      <Divider orientation="left" plain>
        Cột hiển thị
      </Divider>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Các cột của bảng trong hộp thoại. Để trống ⇒ suy ra từ khóa nhãn/giá trị và các khóa được
        ánh xạ.
      </Typography.Text>
      {columns.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: column rows have no stable id; index is fine for this small editor
        <Space key={i} align="end" style={{ display: "flex", marginTop: 8 }}>
          <Form.Item label="Khóa" style={{ marginBottom: 0 }}>
            <Input
              placeholder="khóa trong phản hồi"
              value={c.key}
              onChange={(e) => patchColumn(i, { key: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="Tiêu đề" style={{ marginBottom: 0 }}>
            <Input
              placeholder="tiêu đề cột"
              value={c.title}
              onChange={(e) => patchColumn(i, { title: e.target.value })}
            />
          </Form.Item>
          <Button size="small" onClick={() => setColumns(columns.filter((_, idx) => idx !== i))}>
            Xóa
          </Button>
        </Space>
      ))}
      <div style={{ marginTop: 8 }}>
        <Button size="small" onClick={() => setColumns([...columns, { key: "", title: "" }])}>
          Thêm cột
        </Button>
      </div>

      <Divider orientation="left" plain>
        Ánh xạ khi áp dụng
      </Divider>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Lấy khóa của bản ghi đã chọn và điền vào trường tương ứng.
      </Typography.Text>
      {mapping.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: mapping rows have no stable id; index is fine for this small editor
        <Space key={i} align="end" style={{ display: "flex", marginTop: 8 }}>
          <Form.Item label="Từ khóa" style={{ marginBottom: 0 }}>
            <Input
              placeholder="khóa trong phản hồi"
              value={m.from}
              onChange={(e) => patchMapping(i, { from: e.target.value })}
            />
          </Form.Item>
          <Form.Item label="Vào trường" style={{ marginBottom: 0 }}>
            <Select
              style={{ width: 130 }}
              value={m.to || undefined}
              options={targets.map((n) => ({ label: n, value: n }))}
              onChange={(to) => patchMapping(i, { to })}
            />
          </Form.Item>
          <Button size="small" onClick={() => setMapping(mapping.filter((_, idx) => idx !== i))}>
            Xóa
          </Button>
        </Space>
      ))}
      <div style={{ marginTop: 8 }}>
        <Button
          size="small"
          onClick={() => setMapping([...mapping, { from: "", to: targets[0] ?? "" }])}
        >
          Thêm ánh xạ
        </Button>
      </div>
    </>
  );
}
