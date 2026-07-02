import { PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Checkbox,
  Input,
  Modal,
  message,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import type { RoleWithFunctions } from "./client";
import { useRbacFunctions, useRoleMutations } from "./useAdmin";

/**
 * Tenant role management (D1): create/rename/delete roles and edit the function codes each
 * grants (checkboxes over the platform catalog). The built-in `system` admin role (which holds
 * the `*` wildcard) is read-only — the server rejects edits, so the UI locks it too.
 */
export function RolesPanel({ roles, loading }: { roles: RoleWithFunctions[]; loading: boolean }) {
  const { functions: catalog } = useRbacFunctions(true);
  const mutations = useRoleMutations();

  // One modal for create + edit: `editing` is null (closed), "new" (create) or the role.
  const [editing, setEditing] = useState<RoleWithFunctions | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [granting, setGranting] = useState<RoleWithFunctions | null>(null);
  const [codes, setCodes] = useState<string[]>([]);

  function openEditor(role: RoleWithFunctions | "new") {
    setEditing(role);
    setName(role === "new" ? "" : role.name);
    setDescription(role === "new" ? "" : (role.description ?? ""));
  }

  async function onSaveRole() {
    if (!name.trim() || editing === null) return;
    try {
      if (editing === "new") await mutations.create(name.trim(), description.trim() || undefined);
      else
        await mutations.update(editing.id, {
          name: name.trim(),
          description: description.trim() || undefined,
        });
      message.success("Đã lưu vai trò");
      setEditing(null);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function onSaveFunctions() {
    if (!granting) return;
    try {
      await mutations.setFunctions(granting.id, codes);
      message.success("Đã cập nhật quyền");
      setGranting(null);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Typography.Text type="secondary">
          Vai trò do tổ chức tự định nghĩa; mỗi vai trò gộp một nhóm quyền chức năng.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor("new")}>
          Tạo vai trò
        </Button>
      </Space>

      <Table<RoleWithFunctions>
        rowKey="id"
        loading={loading}
        dataSource={roles}
        pagination={false}
        size="middle"
        columns={[
          {
            title: "Vai trò",
            dataIndex: "name",
            render: (v: string, row) => (
              <Space>
                {v}
                {row.system && <Tag color="gold">hệ thống</Tag>}
              </Space>
            ),
          },
          { title: "Mô tả", dataIndex: "description", render: (v: string | null) => v ?? "—" },
          {
            title: "Quyền chức năng",
            dataIndex: "functions",
            render: (fns: string[], row) =>
              row.system ? (
                <Tag color="gold">toàn quyền</Tag>
              ) : fns.length === 0 ? (
                <Typography.Text type="secondary">Chưa có</Typography.Text>
              ) : (
                fns.map((code) => <Tag key={code}>{code}</Tag>)
              ),
          },
          {
            title: "",
            key: "actions",
            width: 220,
            render: (_, row) =>
              row.system ? null : (
                <Space>
                  <Button size="small" onClick={() => openEditor(row)}>
                    Sửa
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      setGranting(row);
                      setCodes(row.functions);
                    }}
                  >
                    Phân quyền
                  </Button>
                  <Popconfirm
                    title="Xóa vai trò này?"
                    okText="Xóa"
                    cancelText="Hủy"
                    onConfirm={() =>
                      mutations.remove(row.id).then(
                        () => message.success("Đã xóa vai trò"),
                        (e) => message.error((e as Error).message),
                      )
                    }
                  >
                    <Button size="small" danger>
                      Xóa
                    </Button>
                  </Popconfirm>
                </Space>
              ),
          },
        ]}
      />

      <Modal
        open={editing !== null}
        title={editing === "new" ? "Tạo vai trò" : "Sửa vai trò"}
        okText="Lưu"
        cancelText="Hủy"
        onOk={onSaveRole}
        onCancel={() => setEditing(null)}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input
            placeholder="Tên vai trò (vd: Biên tập)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={onSaveRole}
          />
          <Input.TextArea
            placeholder="Mô tả (tùy chọn)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </Space>
      </Modal>

      <Modal
        open={granting !== null}
        title={`Phân quyền — ${granting?.name ?? ""}`}
        okText="Lưu"
        cancelText="Hủy"
        onOk={onSaveFunctions}
        onCancel={() => setGranting(null)}
      >
        <Checkbox.Group
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
          value={codes}
          onChange={(v) => setCodes(v as string[])}
          options={[...catalog]
            .sort((a, b) => a.code.localeCompare(b.code))
            .map((f) => ({
              value: f.code,
              label: (
                <span>
                  {f.name} <Typography.Text type="secondary">({f.code})</Typography.Text>
                </span>
              ),
            }))}
        />
      </Modal>
    </div>
  );
}
