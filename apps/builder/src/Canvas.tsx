import { DeleteOutlined, HolderOutlined } from "@ant-design/icons";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Empty, Tag, Typography } from "antd";
import { type EditorField, type EditorModel, fieldTypeLabel } from "./model";

export const CANVAS_ID = "canvas";

function CanvasRow({
  item,
  selected,
  onSelect,
  onRemove,
}: {
  item: EditorField;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.uid,
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    marginBottom: 6,
    borderRadius: 6,
    border: `1px solid ${selected ? "#1677ff" : "rgba(0,0,0,0.12)"}`,
    background: selected ? "#e6f4ff" : "#fff",
  };
  return (
    <div ref={setNodeRef} style={style}>
      <span {...attributes} {...listeners} style={{ cursor: "grab", color: "rgba(0,0,0,0.4)" }}>
        <HolderOutlined />
      </span>
      {/* The field summary is the selection target — a real button so keyboard
          users can select the field; the drag handle and delete stay separate. */}
      <button
        type="button"
        onClick={onSelect}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.field.label || item.field.name}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {item.field.name}
        </Typography.Text>
      </button>
      <Tag>{fieldTypeLabel(item.field.type)}</Tag>
      <Button
        type="text"
        size="small"
        icon={<DeleteOutlined />}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      />
    </div>
  );
}

/** Middle column: the sortable list of authored fields. */
export function Canvas({
  model,
  selectedUid,
  onSelect,
  onRemove,
}: {
  model: EditorModel;
  selectedUid: string | null;
  onSelect: (uid: string) => void;
  onRemove: (uid: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_ID });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        overflow: "auto",
        padding: 12,
        background: isOver ? "#f0f7ff" : undefined,
      }}
    >
      {model.fields.length === 0 ? (
        <Empty description="Drag a field here to start" style={{ marginTop: 48 }} />
      ) : (
        <SortableContext
          items={model.fields.map((f) => f.uid)}
          strategy={verticalListSortingStrategy}
        >
          {model.fields.map((item) => (
            <CanvasRow
              key={item.uid}
              item={item}
              selected={item.uid === selectedUid}
              onSelect={() => onSelect(item.uid)}
              onRemove={() => onRemove(item.uid)}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}
