import { Card, Typography } from "antd";
import { useDesigner } from "./DesignCanvas";
import { type FieldType, fieldsByCategory, fieldTypeLabel } from "./field-registry";

/** A palette chip. Pressing it starts a "create" drag through the pointer engine;
 *  releasing over a droppable canvas node inserts a fresh field there. */
function PaletteItem({ type }: { type: FieldType }) {
  const { beginCreate } = useDesigner();
  return (
    <Card
      size="small"
      hoverable
      style={{ cursor: "grab", userSelect: "none", touchAction: "none" }}
      styles={{ body: { padding: "8px 12px" } }}
      onPointerDown={(e) => beginCreate(type, e)}
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
