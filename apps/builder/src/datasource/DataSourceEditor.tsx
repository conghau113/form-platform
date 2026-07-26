import type { FieldNode, LeafField } from "@org/form-schema";
import {
  Button,
  Divider,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Typography,
} from "antd";
import { OptionsEditor } from "../PropertyPanel";
import { TreeOptionsEditor } from "./TreeOptionsEditor";

/** The leaf types that share the static-options / remote-dataSource shape. The two
 *  TREE-shaped ones (cascader/tree-select) author static options via the recursive
 *  TreeOptionsEditor and may declare a remote `childrenKey`. */
type OptionSourcedField = Extract<
  LeafField,
  { type: "select" | "checkbox-group" | "cascader" | "tree-select" }
>;
type DataSource = NonNullable<OptionSourcedField["dataSource"]>;
type Param = NonNullable<DataSource["params"]>[number];

/** Whether a leaf sources its options from static `options` or a remote `dataSource`
 *  (and therefore gets the DataSourceEditor in the property panel). */
export function isOptionSourced(field: FieldNode): field is OptionSourcedField {
  return (
    field.type === "select" ||
    field.type === "checkbox-group" ||
    field.type === "cascader" ||
    field.type === "tree-select"
  );
}

/** Options source editor for an option-sourced leaf: a toggle between **static**
 *  options (the shared OptionsEditor; the recursive TreeOptionsEditor for the tree
 *  types) and a **remote** `dataSource`. Remote authoring covers url + label/value
 *  keys (+ a children key for the tree types), a cache TTL, and a params editor that
 *  maps query params to other fields' values (level 2). A legacy single `dependsOn`
 *  is shown as one param row and normalized to `params` on the first edit. Writing
 *  one source clears the other. */
export function DataSourceEditor({
  field,
  sourceNames,
  locales,
  set,
}: {
  field: OptionSourcedField;
  /** Other field names a param can read its value from. */
  sourceNames: string[];
  /** Extra locales configured on the form; threaded to the static-option translate UI. */
  locales?: string[];
  set: (patch: Partial<OptionSourcedField>) => void;
}) {
  const isTree = field.type === "cascader" || field.type === "tree-select";
  const ds = field.dataSource;
  const mode = ds ? "remote" : "static";

  // Merge a partial into the current dataSource (remote mode owns options → clear them).
  const setDs = (patch: Partial<DataSource>) =>
    set({
      dataSource: { url: "", labelKey: "", valueKey: "", ...ds, ...patch },
      options: undefined,
    });

  // A legacy `dependsOn` surfaces as a single param row; editing params normalizes it away.
  const params: Param[] =
    ds?.params ?? (ds?.dependsOn ? [{ name: ds.dependsOn, from: ds.dependsOn }] : []);
  const setParams = (next: Param[]) =>
    setDs({ params: next.length ? next : undefined, dependsOn: undefined });
  const patchParam = (i: number, patch: Partial<Param>) =>
    setParams(params.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  return (
    <>
      <Divider orientation="left" plain>
        Tùy chọn
      </Divider>
      <Form.Item label="Nguồn">
        <Segmented
          value={mode}
          onChange={(m) => {
            if (m === "static") set({ dataSource: undefined, options: field.options ?? [] });
            else set({ options: undefined, dataSource: { url: "", labelKey: "", valueKey: "" } });
          }}
          options={[
            { label: "Tĩnh", value: "static" },
            { label: "Từ xa (nguồn dữ liệu)", value: "remote" },
          ]}
        />
      </Form.Item>

      {mode === "static" ? (
        <Form.Item label="Tùy chọn">
          {/* The options patch is typed per branch (TreeOption[] vs Option[]), so it
              needs the cast back to the union's Partial. */}
          {field.type === "cascader" || field.type === "tree-select" ? (
            <TreeOptionsEditor
              options={field.options ?? []}
              locales={locales}
              onChange={(options) =>
                set({ options, dataSource: undefined } as Partial<OptionSourcedField>)
              }
            />
          ) : (
            <OptionsEditor
              options={field.options ?? []}
              locales={locales}
              onChange={(options) =>
                set({ options, dataSource: undefined } as Partial<OptionSourcedField>)
              }
            />
          )}
        </Form.Item>
      ) : (
        <>
          <Form.Item label="URL">
            <Input value={ds?.url ?? ""} onChange={(e) => setDs({ url: e.target.value })} />
          </Form.Item>
          <Space>
            <Form.Item label="Khóa nhãn">
              <Input
                value={ds?.labelKey ?? ""}
                onChange={(e) => setDs({ labelKey: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="Khóa giá trị">
              <Input
                value={ds?.valueKey ?? ""}
                onChange={(e) => setDs({ valueKey: e.target.value })}
              />
            </Form.Item>
          </Space>
          {isTree && (
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
      )}
    </>
  );
}
