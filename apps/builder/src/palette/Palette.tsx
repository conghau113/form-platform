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
  PushpinFilled,
  PushpinOutlined,
  SearchOutlined,
  SlidersOutlined,
  StarOutlined,
  SwitcherOutlined,
  TableOutlined,
  UnorderedListOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import type { FieldNode } from "@org/form-schema";
import { Button, Empty, Input, Typography } from "antd";
import { type ReactNode, useMemo, useState } from "react";
import { useDesigner } from "../canvas/DesignerContext";
import { type FieldType, type PaletteEntry, paletteEntries } from "../field-registry";
import { usePins } from "../lib";
import { PresetSection, type PresetStore } from "../presets";
import { DraggableChip } from "./PaletteChip";

const PINNED_ENTRIES_KEY = "palette.pinnedEntries";

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
  lookup: <SearchOutlined />,
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
  text: "Ô nhập văn bản một dòng",
  textarea: "Ô nhập văn bản nhiều dòng",
  password: "Ô nhập ẩn cho mật khẩu",
  number: "Ô nhập số có min/max/bước nhảy",
  select: "Chọn từ danh sách tùy chọn",
  "checkbox-group": "Chọn nhiều tùy chọn",
  radio: "Chọn đúng một tùy chọn",
  cascader: "Chọn giá trị theo cây cha→con",
  "tree-select": "Chọn từ cây phân cấp",
  lookup: "Chọn bản ghi trong hộp thoại, tự điền các trường liên quan",
  checkbox: "Một ô bật/tắt đơn",
  switch: "Công tắc bật/tắt",
  slider: "Kéo để chọn số trong khoảng",
  rate: "Đánh giá sao/tim",
  date: "Chọn ngày",
  "date-range": "Chọn ngày bắt đầu và kết thúc",
  time: "Chọn giờ",
  "time-range": "Chọn giờ bắt đầu và kết thúc",
  color: "Chọn màu",
  upload: "Đính kèm tệp",
  array: "Danh sách trường lặp lại",
  tabs: "Nhóm trường theo tab",
  collapse: "Nhóm trường vào panel thu gọn",
  card: "Nhóm trường trong thẻ có viền",
  grid: "Xếp trường theo lưới co giãn",
  space: "Xếp trường theo hàng/cột có khoảng cách",
  steps: "Trình hướng dẫn nhiều bước",
};

/** A palette chip. Pressing it starts a "create" drag through the pointer engine;
 *  releasing over a droppable canvas node inserts a fresh field (seeded with the entry's
 *  optional `patch` — e.g. an array variant or the upload dragger flag) there. */
function PaletteItem({
  entry,
  pinned,
  onTogglePin,
}: {
  entry: PaletteEntry;
  pinned: boolean;
  onTogglePin: (id: string) => void;
}) {
  const { beginCreate } = useDesigner();
  const icon = ENTRY_ICON[entry.id] ?? TYPE_ICON[entry.type] ?? <AppstoreOutlined />;
  return (
    <DraggableChip
      icon={icon}
      label={entry.label}
      hint={entry.hint ?? TYPE_HINT[entry.type] ?? entry.label}
      onPointerDown={(e) => beginCreate(entry.type, e, { patch: entry.patch, label: entry.label })}
      extra={
        <Button
          type="text"
          size="small"
          aria-label={pinned ? `Bỏ ghim ${entry.label}` : `Ghim ${entry.label}`}
          icon={pinned ? <PushpinFilled /> : <PushpinOutlined />}
          // Stop the press from starting a create-drag on the chip behind it.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onTogglePin(entry.id)}
        />
      }
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
  const { order, pinned, isPinned, toggle } = usePins(PINNED_ENTRIES_KEY);
  const { pinnedGroup, groups } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (e: PaletteEntry) =>
      !q || e.label.toLowerCase().includes(q) || e.type.includes(q);
    const all = paletteEntries();
    // Pinned entries are lifted out of their categories into a single "Pinned" group at the
    // top (no duplication), ordered by when they were pinned; the rest keep their category
    // grouping. Both honour the search.
    const pinnedGroup = all
      .flatMap((g) => g.items)
      .filter((e) => pinned.has(e.id) && matches(e))
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const groups = all
      .map(({ category, items }) => ({
        category,
        items: items.filter((e) => !pinned.has(e.id) && matches(e)),
      }))
      .filter((g) => g.items.length > 0);
    return { pinnedGroup, groups };
  }, [query, order, pinned]);

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
        placeholder="Tìm thành phần"
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
      {pinnedGroup.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}
          >
            Đã ghim
          </Typography.Text>
          {pinnedGroup.map((entry) => (
            <PaletteItem key={entry.id} entry={entry} pinned onTogglePin={toggle} />
          ))}
        </div>
      )}
      {groups.length === 0 && pinnedGroup.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có thành phần" />
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
              <PaletteItem
                key={entry.id}
                entry={entry}
                pinned={isPinned(entry.id)}
                onTogglePin={toggle}
              />
            ))}
          </div>
        ))
      )}
    </div>
  );
}
