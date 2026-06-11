import { DeleteOutlined, HolderOutlined } from "@ant-design/icons";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Empty, Tag, Typography } from "antd";
import type { EngineProps, TreeNode } from "./engine/tree";
import { fieldTypeLabel } from "./field-registry";

export const CANVAS_ID = "canvas";

/** A row's display name: label / title / name / type, tolerant of nameless containers. */
function nodeTitle(node: EngineProps): string {
  if ("label" in node && node.label) return node.label;
  if ("title" in node && node.title) return node.title;
  if (node.type !== "form" && "name" in node && node.name) return node.name;
  return node.type;
}
function nodeSubtitle(node: EngineProps): string {
  return node.type !== "form" && "name" in node && node.name ? node.name : node.type;
}

function CanvasRow({
  item,
  selected,
  onSelect,
  onRemove,
}: {
  item: TreeNode;
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
      {/* The node summary is the selection target — a real button so keyboard
          users can select it; the drag handle and delete stay separate. */}
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
          {nodeTitle(item.node)}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {nodeSubtitle(item.node)}
        </Typography.Text>
      </button>
      <Tag>{fieldTypeLabel(item.node.type)}</Tag>
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

/** Middle column: the sortable list of the form root's top-level nodes. */
export function Canvas({
  nodes,
  selectedUid,
  onSelect,
  onRemove,
}: {
  nodes: TreeNode[];
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
      {nodes.length === 0 ? (
        <Empty description="Drag a field here to start" style={{ marginTop: 48 }} />
      ) : (
        <SortableContext items={nodes.map((n) => n.uid)} strategy={verticalListSortingStrategy}>
          {nodes.map((item) => (
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
