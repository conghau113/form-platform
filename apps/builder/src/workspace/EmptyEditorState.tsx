import { Empty } from "antd";

/** Index view of a project workspace — shown until a form is opened in the editor pane. */
export function EmptyEditorState() {
  return (
    <div
      style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <Empty description="Chọn hoặc tạo một form để chỉnh sửa." />
    </div>
  );
}
