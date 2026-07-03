import { CloseOutlined, SettingOutlined } from "@ant-design/icons";
import { Button, Tooltip, Typography } from "antd";
import type { ReactNode } from "react";
import { ancestorsOf, type TreeNode } from "../engine/tree";
import { nodeLabel } from "./OutlineTree";
import { isBoolean, usePersistentState } from "./persist";

/* ----------------------------------------------------------------------------
 * SettingsPanel — the right rail (Designable's SettingsForm shell). A header
 * with the selected node's ancestor breadcrumb (each crumb selects that
 * ancestor) and a close toggle that collapses the panel to a slim rail; the
 * body is the PropertyPanel passed as children. Open/closed is panel-local UI
 * state, persisted across reloads.
 * ------------------------------------------------------------------------- */

export function SettingsPanel({
  tree,
  selectedUid,
  onSelect,
  children,
}: {
  tree: TreeNode;
  selectedUid: string | null;
  /** Select a breadcrumb ancestor. */
  onSelect: (uid: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = usePersistentState("settingsOpen", true, isBoolean);

  if (!open) {
    return (
      <aside style={{ display: "flex", alignItems: "flex-start", padding: 4 }}>
        <Tooltip title="Open settings" placement="left">
          <Button
            aria-label="Open settings"
            type="text"
            icon={<SettingOutlined />}
            onClick={() => setOpen(true)}
          />
        </Tooltip>
      </aside>
    );
  }

  const path = selectedUid ? ancestorsOf(tree, selectedUid) : null;

  return (
    <aside
      style={{
        // Shrinks toward 280px on narrow viewports so the canvas keeps room.
        width: "clamp(280px, 25vw, 340px)",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          minHeight: 40,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {path ? (
            path.map((node, depth) =>
              depth < path.length - 1 ? (
                <Button
                  key={node.uid}
                  type="link"
                  size="small"
                  style={{ padding: 0, height: "auto" }}
                  onClick={() => onSelect(node.uid)}
                >
                  {nodeLabel(node.node)}&nbsp;/&nbsp;
                </Button>
              ) : (
                <Typography.Text key={node.uid} strong>
                  {nodeLabel(node.node)}
                </Typography.Text>
              ),
            )
          ) : (
            <Typography.Text type="secondary">Settings</Typography.Text>
          )}
        </div>
        <Tooltip title="Close settings">
          <Button
            aria-label="Close settings"
            type="text"
            size="small"
            icon={<CloseOutlined />}
            onClick={() => setOpen(false)}
          />
        </Tooltip>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
    </aside>
  );
}
