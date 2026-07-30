import type { FieldNode, LeafField } from "@org/form-schema";
import { Divider, Form, Segmented } from "antd";
import { OptionsEditor } from "../PropertyPanel";
import { RemoteSourceFields } from "./RemoteSourceFields";
import { TreeOptionsEditor } from "./TreeOptionsEditor";

/** The leaf types that share the static-options / remote-dataSource shape. The two
 *  TREE-shaped ones (cascader/tree-select) author static options via the recursive
 *  TreeOptionsEditor and may declare a remote `childrenKey`. */
type OptionSourcedField = Extract<
  LeafField,
  { type: "select" | "checkbox-group" | "cascader" | "tree-select" }
>;
type DataSource = NonNullable<OptionSourcedField["dataSource"]>;

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
        <RemoteSourceFields
          ds={ds}
          setDs={setDs}
          sourceNames={sourceNames}
          showChildrenKey={isTree}
        />
      )}
    </>
  );
}
