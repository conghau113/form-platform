import { type ArrayField, CURRENT_FORM_VERSION, type FieldNode } from "@org/form-schema";
import { Button, Card, Grid, Row, Space, Table } from "antd";
import { Fragment } from "react";
import { type Control, useFieldArray, useWatch } from "react-hook-form";
import { openFormDialog } from "../imperative.js";
import type { RenderNode, Scope } from "../internal/control-types.js";

/** Per-row reorder/remove controls, shared by the card and table variants. */
function RowControls(props: {
  index: number;
  count: number;
  move: (from: number, to: number) => void;
  remove: (index: number) => void;
}) {
  const { index, count, move, remove } = props;
  return (
    <Space size={4}>
      <Button
        size="small"
        type="text"
        disabled={index === 0}
        onClick={() => move(index, index - 1)}
      >
        ↑
      </Button>
      <Button
        size="small"
        type="text"
        disabled={index === count - 1}
        onClick={() => move(index, index + 1)}
      >
        ↓
      </Button>
      <Button size="small" type="text" danger onClick={() => remove(index)}>
        Remove
      </Button>
    </Space>
  );
}

/** Read-only text for a table cell in `editInDialog` mode (the row is edited in a popup,
 *  not inline). Only named leaf fields have a value to show; containers render blank. */
function rowCellText(child: FieldNode, row: Record<string, unknown> | undefined): React.ReactNode {
  if (!("name" in child) || !row) return null;
  const v = row[child.name];
  if (v == null || v === "") return null;
  return String(v);
}

/** Renders an `array` (Form List) node: a repeatable set of rows authored from the
 *  node's `itemFields`. `useFieldArray` owns add/remove/reorder; each control binds to
 *  `name.{index}.{child}` via `renderNode`. `variant` picks the card or table layout. */
export function ArrayFieldSection(props: {
  node: ArrayField;
  control: Control;
  name: string;
  /** Seed object for a freshly appended row (item-field defaultValues). */
  seedRow: () => Record<string, unknown>;
  renderNode: RenderNode;
  /** Reactive scope for row `i` (merged row values + per-row EffectMap). */
  getRowScope: (index: number) => Scope;
}) {
  const { node, control, name, seedRow, renderNode, getRowScope } = props;
  const { fields, append, remove, move, update } = useFieldArray({ control, name });
  const addButton = <Button onClick={() => append(seedRow())}>Add {node.label || "item"}</Button>;

  // "auto" is responsive: table on >=md, cards below. `useBreakpoint` re-renders on
  // resize; "card"/"table"/undefined resolve to a fixed layout (undefined ⇒ card).
  const screens = Grid.useBreakpoint();
  const variant = node.variant === "auto" ? (screens.md ? "table" : "card") : node.variant;

  // Table + editInDialog: rows are read-only and edited in a popup. Watch the live row
  // values to display the cells and seed the dialog; write the result back with `update`.
  const editInDialog = variant === "table" && node.editInDialog === true;
  const watched = useWatch({ control, name }) as Array<Record<string, unknown>> | undefined;
  const openRowDialog = async (index: number) => {
    const result = await openFormDialog(
      {
        formVersion: CURRENT_FORM_VERSION,
        id: node.name,
        title: node.label,
        fields: node.itemFields,
      },
      { title: node.label, initialValues: watched?.[index] ?? {} },
    );
    if (result) update(index, result);
  };
  const help = node.helpText ? (
    <div style={{ color: "rgba(0,0,0,0.45)", fontSize: 12, marginTop: 8 }}>{node.helpText}</div>
  ) : null;

  let body: React.ReactNode;
  if (variant === "table") {
    // One column per item field (cells render the control bare + label-less) plus an
    // actions column. dataSource carries each row's react-hook-form index.
    type RowRec = { key: string; index: number };
    const columns = [
      // Nameless layout containers can appear among itemFields; fall back to their
      // label/title (or type) for the header and the index for column identity.
      ...node.itemFields.map((child, col) => ({
        title:
          ("label" in child && child.label) ||
          ("title" in child && child.title) ||
          ("name" in child && child.name) ||
          child.type,
        key: "name" in child ? child.name : `${child.type}-${col}`,
        render: (_: unknown, rec: RowRec) =>
          editInDialog
            ? rowCellText(child, watched?.[rec.index])
            : renderNode(child, `${name}.${rec.index}.`, {
                hideLabel: true,
                bare: true,
                scope: getRowScope(rec.index),
              }),
      })),
      {
        title: "",
        key: "_actions",
        width: editInDialog ? 200 : 130,
        render: (_: unknown, rec: RowRec) => (
          <Space size={4}>
            {editInDialog ? (
              <Button size="small" onClick={() => openRowDialog(rec.index)}>
                Edit
              </Button>
            ) : null}
            <RowControls index={rec.index} count={fields.length} move={move} remove={remove} />
          </Space>
        ),
      },
    ];
    const dataSource: RowRec[] = fields.map((row, i) => ({ key: row.id, index: i }));
    body = (
      <>
        <Table size="small" pagination={false} columns={columns} dataSource={dataSource} />
        <div style={{ marginTop: 8 }}>{addButton}</div>
      </>
    );
  } else {
    body = (
      <>
        {fields.map((row, i) => (
          <Card
            key={row.id}
            size="small"
            style={{ marginBottom: 8 }}
            extra={<RowControls index={i} count={fields.length} move={move} remove={remove} />}
          >
            <Row gutter={16}>
              {node.itemFields.map((c, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: item fields are static per render
                <Fragment key={j}>
                  {renderNode(c, `${name}.${i}.`, { scope: getRowScope(i) })}
                </Fragment>
              ))}
            </Row>
          </Card>
        ))}
        {addButton}
      </>
    );
  }

  return (
    <fieldset style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, padding: 16 }}>
      {node.label ? <legend style={{ padding: "0 8px" }}>{node.label}</legend> : null}
      {body}
      {help}
    </fieldset>
  );
}
