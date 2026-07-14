import { Empty } from "antd";
import { useOutletContext } from "react-router-dom";
import { ExplorerToggle } from "./ExplorerToggle";
import type { WorkspaceOutletContext } from "./ProjectWorkspace";

/** Index view of a project workspace — shown until a form is opened in the editor pane. */
export function EmptyEditorState() {
  const { explorerCollapsed, setExplorerCollapsed } = useOutletContext<WorkspaceOutletContext>();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderBottom: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <ExplorerToggle collapsed={explorerCollapsed} onCollapsedChange={setExplorerCollapsed} />
      </header>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Empty description="Chọn hoặc tạo một biểu mẫu để chỉnh sửa." />
      </div>
    </div>
  );
}
