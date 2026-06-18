import { Card, Tooltip } from "antd";
import type { ReactNode } from "react";

/** Shared visual for a draggable chip in the left rail — a palette component or a saved
 *  preset. Pressing the body starts a "create" drag through the pointer engine; `extra`
 *  (e.g. a delete button) sits on the right and must stop its own pointer events so it
 *  never starts a drag. Purely presentational: the caller owns `onPointerDown`. */
export function DraggableChip({
  icon,
  label,
  hint,
  onPointerDown,
  extra,
}: {
  icon: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  onPointerDown: (e: React.PointerEvent) => void;
  extra?: ReactNode;
}) {
  return (
    <Tooltip title={hint} placement="right" mouseEnterDelay={0.4}>
      <Card
        size="small"
        hoverable
        style={{
          cursor: "grab",
          userSelect: "none",
          touchAction: "none",
          border: "1px solid rgb(199, 199, 199)",
        }}
        styles={{
          body: {
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
          },
        }}
        onPointerDown={onPointerDown}
      >
        <span style={{ color: "rgba(0,0,0,0.45)", fontSize: 20, display: "inline-flex" }}>
          {icon}
        </span>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {label}
        </span>
        {extra}
      </Card>
    </Tooltip>
  );
}
