import { CaretDownOutlined, CaretRightOutlined } from "@ant-design/icons";
import { Empty } from "antd";
import { useState } from "react";
import { useDesigner } from "../DesignCanvas";
import type { EngineProps, TreeNode } from "../engine/tree";
import { describeNode } from "../field-registry";
import { useHover } from "./hover";

const BLUE = "#1677ff";
const RED = "#ff4d4f";

/* ----------------------------------------------------------------------------
 * OutlineTree — the CompositePanel "Outline" tab. Mirrors the designer model as
 * an indented tree: rows select/hover in sync with the canvas (shared designer +
 * hover contexts) and drag-reorder through the SAME pointer engine — each row is
 * a `data-designer-node-id` drop target, so `useDragon`/MoveHelper handle it with
 * no new logic; the row just draws its own insertion indicator from `drag.intent`.
 *
 * Rows share the `data-designer-node-id` namespace with the canvas shells by
 * design: `useDragon` hit-tests `elementFromPoint`, and the two surfaces never
 * overlap, so the pointer resolves to whichever one it is over. That makes a drag
 * started on the canvas droppable onto the outline and vice-versa (Designable
 * does the same) — the commit keys off the resolved uid, not the origin surface.
 * ------------------------------------------------------------------------- */

function nodeLabel(node: EngineProps): string {
  if ("label" in node && node.label) return node.label;
  if ("title" in node && node.title) return node.title;
  if ("name" in node && node.name) return node.name;
  return node.type;
}

function Row({
  node,
  depth,
  collapsed,
  toggle,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  toggle: (uid: string) => void;
}) {
  const d = useDesigner();
  const { hovered, setHovered } = useHover();
  const uid = node.uid;
  const selected = d.selected.includes(uid);
  const isHovered = hovered === uid && !selected;
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(uid);
  // The Form root is never draggable (mirrors the canvas): it only selects on click.
  const draggable = describeNode(node.node.type).behavior.draggable;

  // Live drop feedback while a drag targets this row (mirrors NodeShell).
  const dropHere = d.drag?.intent && d.drag.intent.uid === uid ? d.drag : null;
  const dropColor = dropHere?.valid ? BLUE : RED;
  const insertKind = dropHere?.intent?.kind;

  const background = selected
    ? "rgba(22,119,255,0.12)"
    : insertKind === "inner"
      ? dropHere?.valid
        ? "rgba(22,119,255,0.10)"
        : "rgba(255,77,79,0.10)"
      : isHovered
        ? "rgba(0,0,0,0.04)"
        : undefined;

  return (
    <div>
      <div
        data-designer-node-id={uid}
        // Draggable rows drive the SAME pointer engine as the canvas (a non-drag press
        // selects via onClickSelect); the non-draggable Form root just selects on press.
        onPointerDown={(e) => {
          e.stopPropagation();
          if (draggable) d.beginMove([uid], e, uid);
          else d.select(uid, e.ctrlKey || e.metaKey);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(uid);
        }}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 4,
          paddingLeft: 6 + depth * 14,
          paddingRight: 6,
          height: 26,
          fontSize: 13,
          cursor: draggable ? "grab" : "pointer",
          userSelect: "none",
          touchAction: "none",
          borderRadius: 4,
          color: selected ? BLUE : undefined,
          background,
          // Insertion line for before/after drops.
          boxShadow:
            insertKind === "before"
              ? `inset 0 2px 0 ${dropColor}`
              : insertKind === "after"
                ? `inset 0 -2px 0 ${dropColor}`
                : undefined,
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={isCollapsed ? "Expand" : "Collapse"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toggle(uid);
            }}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              color: "rgba(0,0,0,0.45)",
              fontSize: 11,
              width: 12,
            }}
          >
            {isCollapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
          </button>
        ) : (
          <span style={{ width: 12 }} />
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {nodeLabel(node.node)}
        </span>
        <span style={{ color: "rgba(0,0,0,0.35)", fontSize: 11, marginLeft: "auto" }}>
          {describeNode(node.node.type).label}
        </span>
      </div>
      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map((child) => (
            <Row
              key={child.uid}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              toggle={toggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** The Outline tab body. `root` is the designer tree's Form node. */
export function OutlineTree({ root }: { root: TreeNode }) {
  const { setHovered } = useHover();
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (uid: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  if (root.children.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No fields yet" />
      </div>
    );
  }

  return (
    <div style={{ padding: 8 }} onPointerLeave={() => setHovered(null)}>
      <Row node={root} depth={0} collapsed={collapsed} toggle={toggle} />
    </div>
  );
}
