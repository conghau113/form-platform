import {
  AlignLeftOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  ColumnWidthOutlined,
  CreditCardOutlined,
  DownSquareOutlined,
  EditOutlined,
  FieldNumberOutlined,
  GroupOutlined,
  LayoutOutlined,
  LockOutlined,
  OrderedListOutlined,
  PartitionOutlined,
  SearchOutlined,
  SlidersOutlined,
  StarOutlined,
  SwitcherOutlined,
  TableOutlined,
  UnorderedListOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { Card, Empty, Input, Tooltip, Typography } from "antd";
import { type ReactNode, useMemo, useState } from "react";
import { useDesigner } from "./DesignCanvas";
import { type FieldType, fieldsByCategory, fieldTypeLabel } from "./field-registry";

/** Per-type palette glyph. A field with no entry falls back to a generic block. */
const TYPE_ICON: Partial<Record<FieldType, ReactNode>> = {
  text: <EditOutlined />,
  textarea: <AlignLeftOutlined />,
  password: <LockOutlined />,
  number: <FieldNumberOutlined />,
  select: <DownSquareOutlined />,
  "checkbox-group": <CheckSquareOutlined />,
  radio: <CheckCircleOutlined />,
  cascader: <PartitionOutlined />,
  "tree-select": <PartitionOutlined />,
  checkbox: <CheckSquareOutlined />,
  switch: <SwitcherOutlined />,
  slider: <SlidersOutlined />,
  rate: <StarOutlined />,
  date: <CalendarOutlined />,
  "date-range": <CalendarOutlined />,
  time: <ClockCircleOutlined />,
  "time-range": <ClockCircleOutlined />,
  color: <BgColorsOutlined />,
  upload: <UploadOutlined />,
  array: <UnorderedListOutlined />,
  tabs: <LayoutOutlined />,
  collapse: <GroupOutlined />,
  card: <CreditCardOutlined />,
  grid: <TableOutlined />,
  space: <ColumnWidthOutlined />,
  steps: <OrderedListOutlined />,
};

/** One-line tooltip hint per type (falls back to the label when absent). */
const TYPE_HINT: Partial<Record<FieldType, string>> = {
  text: "Single-line text input",
  textarea: "Multi-line text input",
  password: "Masked input for secrets",
  number: "Numeric input with min/max/step",
  select: "Pick from a list of options",
  "checkbox-group": "Pick several options",
  radio: "Pick exactly one option",
  cascader: "Pick a value down a parent→child tree",
  "tree-select": "Pick from a hierarchical tree",
  checkbox: "A single on/off box",
  switch: "An on/off toggle",
  slider: "Drag to pick a number in a range",
  rate: "Star/heart rating",
  date: "Pick a date",
  "date-range": "Pick a start and end date",
  time: "Pick a time",
  "time-range": "Pick a start and end time",
  color: "Pick a colour",
  upload: "Attach files",
  array: "A repeatable list of fields",
  tabs: "Group fields into tabs",
  collapse: "Group fields into collapsible panels",
  card: "Group fields in a bordered card",
  grid: "Lay fields out in a responsive grid",
  space: "Lay fields out in a row/column with gaps",
  steps: "A multi-step wizard",
};

/** A palette chip. Pressing it starts a "create" drag through the pointer engine;
 *  releasing over a droppable canvas node inserts a fresh field there. */
function PaletteItem({ type }: { type: FieldType }) {
  const { beginCreate } = useDesigner();
  return (
    <Tooltip
      title={TYPE_HINT[type] ?? fieldTypeLabel(type)}
      placement="right"
      mouseEnterDelay={0.4}
    >
      <Card
        size="small"
        hoverable
        style={{ cursor: "grab", userSelect: "none", touchAction: "none" }}
        styles={{ body: { padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 } }}
        onPointerDown={(e) => beginCreate(type, e)}
      >
        <span style={{ color: "rgba(0,0,0,0.45)", display: "inline-flex" }}>
          {TYPE_ICON[type] ?? <AppstoreOutlined />}
        </span>
        {fieldTypeLabel(type)}
      </Card>
    </Tooltip>
  );
}

/** Left column: draggable chips, one per authorable field type, grouped by category and
 *  filtered by a free-text search over the label. */
export function Palette() {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = fieldsByCategory();
    if (!q) return all;
    return all
      .map(({ category, items }) => ({
        category,
        items: items.filter(
          (d) => fieldTypeLabel(d.type).toLowerCase().includes(q) || d.type.includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
      <Input
        allowClear
        size="small"
        placeholder="Search components"
        prefix={<SearchOutlined />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {groups.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No components" />
      ) : (
        groups.map(({ category, items }) => (
          <div key={category} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase" }}>
              {category}
            </Typography.Text>
            {items.map((d) => (
              // fieldsByCategory only returns palette-visible FieldNode types (never `form`).
              <PaletteItem key={d.type} type={d.type as FieldType} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
