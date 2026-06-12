import type { LeafField } from "@org/form-schema";
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
import { OptionsEditor } from "./PropertyPanel";

type SelectField = Extract<LeafField, { type: "select" }>;
type DataSource = NonNullable<SelectField["dataSource"]>;
type Param = NonNullable<DataSource["params"]>[number];

/** Options source editor for a `select`: a toggle between **static** options (the shared
 *  OptionsEditor) and a **remote** `dataSource`. Remote authoring covers url + label/value
 *  keys, a cache TTL, and a params editor that maps query params to other fields' values
 *  (level 2). A legacy single `dependsOn` is shown as one param row and normalized to
 *  `params` on the first edit. Writing one source clears the other. */
export function DataSourceEditor({
  field,
  sourceNames,
  set,
}: {
  field: SelectField;
  /** Other field names a param can read its value from. */
  sourceNames: string[];
  set: (patch: Partial<SelectField>) => void;
}) {
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
        Options
      </Divider>
      <Form.Item label="Source">
        <Segmented
          value={mode}
          onChange={(m) => {
            if (m === "static") set({ dataSource: undefined, options: field.options ?? [] });
            else set({ options: undefined, dataSource: { url: "", labelKey: "", valueKey: "" } });
          }}
          options={[
            { label: "Static", value: "static" },
            { label: "Remote (data source)", value: "remote" },
          ]}
        />
      </Form.Item>

      {mode === "static" ? (
        <Form.Item label="Options">
          <OptionsEditor
            options={field.options ?? []}
            onChange={(options) => set({ options, dataSource: undefined })}
          />
        </Form.Item>
      ) : (
        <>
          <Form.Item label="URL">
            <Input value={ds?.url ?? ""} onChange={(e) => setDs({ url: e.target.value })} />
          </Form.Item>
          <Space>
            <Form.Item label="Label key">
              <Input
                value={ds?.labelKey ?? ""}
                onChange={(e) => setDs({ labelKey: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="Value key">
              <Input
                value={ds?.valueKey ?? ""}
                onChange={(e) => setDs({ valueKey: e.target.value })}
              />
            </Form.Item>
          </Space>
          <Form.Item label="Cache TTL (ms)">
            <InputNumber
              style={{ width: "100%" }}
              min={0}
              value={ds?.ttlMs ?? null}
              onChange={(v) => setDs({ ttlMs: v ?? undefined })}
            />
          </Form.Item>

          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Params — send another field's current value as a query param.
          </Typography.Text>
          {params.map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: param rows have no stable id; index is fine for this small editor
            <Space key={i} align="end" style={{ display: "flex", marginTop: 8 }}>
              <Form.Item label="Param" style={{ marginBottom: 0 }}>
                <Input
                  placeholder="query name"
                  value={p.name}
                  onChange={(e) => patchParam(i, { name: e.target.value })}
                />
              </Form.Item>
              <Form.Item label="From field" style={{ marginBottom: 0 }}>
                <Select
                  style={{ width: 130 }}
                  value={p.from || undefined}
                  options={sourceNames.map((n) => ({ label: n, value: n }))}
                  onChange={(from) => patchParam(i, { from })}
                />
              </Form.Item>
              <Button size="small" onClick={() => setParams(params.filter((_, idx) => idx !== i))}>
                Remove
              </Button>
            </Space>
          ))}
          <div style={{ marginTop: 8 }}>
            <Button
              size="small"
              onClick={() => setParams([...params, { name: "", from: sourceNames[0] ?? "" }])}
            >
              Add param
            </Button>
          </div>
        </>
      )}
    </>
  );
}
