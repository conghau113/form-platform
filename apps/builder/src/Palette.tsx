import { useDraggable } from "@dnd-kit/core";
import { Card, Typography } from "antd";
import { type FieldType, fieldsByCategory, fieldTypeLabel, PALETTE_TYPES } from "./field-registry";

export const PALETTE_PREFIX = "palette:";

/** Resolve a dnd-kit active id back to a palette field type, or null if it's not one. */
export function paletteType(activeId: string): FieldType | null {
  if (!activeId.startsWith(PALETTE_PREFIX)) return null;
  const type = activeId.slice(PALETTE_PREFIX.length) as FieldType;
  return PALETTE_TYPES.includes(type) ? type : null;
}

function PaletteItem({ type }: { type: FieldType }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${PALETTE_PREFIX}${type}`,
  });
  return (
    <Card
      ref={setNodeRef}
      size="small"
      hoverable
      style={{ cursor: "grab", opacity: isDragging ? 0.4 : 1, userSelect: "none" }}
      styles={{ body: { padding: "8px 12px" } }}
      {...listeners}
      {...attributes}
    >
      {fieldTypeLabel(type)}
    </Card>
  );
}

/** Left column: draggable chips, one per authorable field type, grouped by category. */
export function Palette() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
      {fieldsByCategory().map(({ category, items }) => (
        <div key={category} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase" }}>
            {category}
          </Typography.Text>
          {items.map((d) => (
            // fieldsByCategory only returns palette-visible FieldNode types (never `form`).
            <PaletteItem key={d.type} type={d.type as FieldType} />
          ))}
        </div>
      ))}
    </div>
  );
}
