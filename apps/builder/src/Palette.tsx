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
  InboxOutlined,
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
import type { FieldNode } from "@org/form-schema";
import { Empty, Input, Typography } from "antd";
import { type ReactNode, useMemo, useState } from "react";
import { useDesigner } from "./DesignCanvas";
import { type FieldType, type PaletteEntry, paletteEntries } from "./field-registry";
import { DraggableChip } from "./PaletteChip";
import { PresetSection, type PresetStore } from "./presets";

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

/** Per-entry glyph for palette variants (overrides {@link TYPE_ICON} by entry id). */
const ENTRY_ICON: Record<string, ReactNode> = {
  "array:list": <UnorderedListOutlined />,
  "array:card": <CreditCardOutlined />,
  "array:table": <TableOutlined />,
  "upload:button": <UploadOutlined />,
  "upload:dragger": <InboxOutlined />,
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
 *  releasing over a droppable canvas node inserts a fresh field (seeded with the entry's
 *  optional `patch` — e.g. an array variant or the upload dragger flag) there. */
function PaletteItem({ entry }: { entry: PaletteEntry }) {
  const { beginCreate } = useDesigner();
  const icon = ENTRY_ICON[entry.id] ?? TYPE_ICON[entry.type] ?? <AppstoreOutlined />;
  return (
    <DraggableChip
      icon={icon}
      label={entry.label}
      hint={entry.hint ?? TYPE_HINT[entry.type] ?? entry.label}
      onPointerDown={(e) => beginCreate(entry.type, e, { patch: entry.patch, label: entry.label })}
    />
  );
}

/** Left column: draggable chips, one per authorable field type (types with palette
 *  variants expand to several chips), grouped by category and filtered by a free-text
 *  search over the label. */
export function Palette({
  selectedField,
  projectId,
  presets,
}: {
  selectedField: FieldNode | null;
  projectId?: string;
  presets: PresetStore;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = paletteEntries();
    if (!q) return all;
    return all
      .map(({ category, items }) => ({
        category,
        items: items.filter((e) => e.label.toLowerCase().includes(q) || e.type.includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 12,
      }}
    >
      <Input
        allowClear
        size="small"
        placeholder="Search components"
        prefix={<SearchOutlined />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <PresetSection
        query={query}
        selectedField={selectedField}
        projectId={projectId}
        presets={presets}
      />
      {groups.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No components" />
      ) : (
        groups.map(({ category, items }) => (
          <div key={category} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Typography.Text
              type="secondary"
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {category}
            </Typography.Text>
            {items.map((entry) => (
              <PaletteItem key={entry.id} entry={entry} />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
