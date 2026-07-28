import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { App as AntApp, Button, Empty, Input, Modal, Space, Spin, Tree, Typography } from "antd";
import { useMemo, useState } from "react";
import { buildOrgTree, type OrgTreeNode } from "./orgTree";
import { useOrgUnitMutations, useOrgUnits } from "./useOrgUnits";

/**
 * Org-unit tree management (§6.7 "Quản trị" → Đơn vị, product-roadmap Phase C3). Create/rename/
 * delete the tenant's org tree; roles are then data-scoped to a branch and projects placed under a
 * unit. Server-gated by `org.admin`; this UI only renders the tree and posts edits.
 */
export function OrgUnitsPanel() {
  const { message, modal } = AntApp.useApp();
  const { units, loading } = useOrgUnits(true);
  const mutations = useOrgUnitMutations();
  const treeData = useMemo(() => buildOrgTree(units), [units]);

  // One modal for create-root / create-child / rename. `parentId === undefined` = rename.
  const [editing, setEditing] = useState<
    { mode: "create"; parentId: string | null } | { mode: "rename"; id: string } | null
  >(null);
  const [name, setName] = useState("");

  function openCreate(parentId: string | null) {
    setEditing({ mode: "create", parentId });
    setName("");
  }
  function openRename(id: string, current: string) {
    setEditing({ mode: "rename", id });
    setName(current);
  }

  async function onSave() {
    if (!name.trim() || !editing) return;
    try {
      if (editing.mode === "create") await mutations.create(name.trim(), editing.parentId);
      else await mutations.rename(editing.id, name.trim());
      message.success("Đã lưu đơn vị");
      setEditing(null);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  function onDelete(id: string, title: string) {
    modal.confirm({
      title: `Xóa đơn vị "${title}"?`,
      content:
        "Nếu đơn vị còn đơn vị con hoặc thành viên, thao tác sẽ xóa cả cây con (dự án bên trong sẽ bỏ gán đơn vị).",
      okText: "Xóa",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      onOk: async () => {
        try {
          await mutations.remove(id, true); // cascade — the confirm already warned
          message.success("Đã xóa đơn vị");
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  }

  const titleRender = (node: OrgTreeNode) => (
    <Space>
      <span>{node.title}</span>
      <Button
        type="text"
        size="small"
        icon={<PlusOutlined />}
        title="Thêm đơn vị con"
        onClick={() => openCreate(node.key)}
      />
      <Button
        type="text"
        size="small"
        icon={<EditOutlined />}
        title="Đổi tên"
        onClick={() => openRename(node.key, node.title)}
      />
      <Button
        type="text"
        size="small"
        danger
        icon={<DeleteOutlined />}
        title="Xóa"
        onClick={() => onDelete(node.key, node.title)}
      />
    </Space>
  );

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Typography.Text type="secondary">
          Cây đơn vị của tổ chức; dùng để giới hạn phạm vi dữ liệu của vai trò và xếp dự án theo đơn
          vị.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate(null)}>
          Đơn vị gốc
        </Button>
      </Space>

      {loading ? (
        <Spin />
      ) : treeData.length === 0 ? (
        <Empty description="Chưa có đơn vị nào — tạo một đơn vị gốc để bắt đầu." />
      ) : (
        <Tree<OrgTreeNode>
          treeData={treeData}
          titleRender={titleRender}
          defaultExpandAll
          selectable={false}
          blockNode
        />
      )}

      <Modal
        open={editing !== null}
        title={editing?.mode === "rename" ? "Đổi tên đơn vị" : "Tạo đơn vị"}
        okText="Lưu"
        cancelText="Hủy"
        onOk={onSave}
        onCancel={() => setEditing(null)}
      >
        <Input
          autoFocus
          placeholder="Tên đơn vị (vd: Phòng Nhân sự)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onPressEnter={onSave}
        />
      </Modal>
    </div>
  );
}
