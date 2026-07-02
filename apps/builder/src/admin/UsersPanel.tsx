import { UserAddOutlined } from "@ant-design/icons";
import { Button, Input, Modal, message, Select, Space, Table, Tag, Typography } from "antd";
import { useState } from "react";
import { useAuth } from "../auth";
import type { RoleWithFunctions, TenantUser } from "./client";
import { useMemberMutations, useTenantUsers } from "./useAdmin";

/**
 * Tenant member management (D1): list members, add an existing account by email, and assign the
 * roles each member holds. Role names come from the roles list (the caller holds `user.admin`,
 * which the server also accepts for reading roles — any-of gate).
 */
export function UsersPanel({ roles }: { roles: RoleWithFunctions[] }) {
  const { user: me } = useAuth();
  const { users, loading } = useTenantUsers(true);
  const members = useMemberMutations();

  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState<TenantUser | null>(null);
  const [roleIds, setRoleIds] = useState<string[]>([]);

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;

  async function onAdd() {
    if (!email.trim()) return;
    try {
      await members.add(email.trim());
      message.success("Đã thêm thành viên");
      setAddOpen(false);
      setEmail("");
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function onAssign() {
    if (!editing) return;
    try {
      await members.setRoles(editing.id, roleIds);
      message.success("Đã cập nhật vai trò");
      setEditing(null);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  return (
    <div>
      <Space style={{ marginBottom: 16, justifyContent: "space-between", width: "100%" }}>
        <Typography.Text type="secondary">
          Thành viên của tổ chức và vai trò họ nắm giữ.
        </Typography.Text>
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddOpen(true)}>
          Thêm thành viên
        </Button>
      </Space>

      <Table<TenantUser>
        rowKey="id"
        loading={loading}
        dataSource={users}
        pagination={false}
        size="middle"
        columns={[
          { title: "Email", dataIndex: "email" },
          {
            title: "Tên hiển thị",
            dataIndex: "displayName",
            render: (v: string | null, row) => (
              <Space>
                {v ?? "—"}
                {row.id === me?.id && <Tag>bạn</Tag>}
              </Space>
            ),
          },
          {
            title: "Vai trò",
            dataIndex: "roleIds",
            render: (ids: string[]) =>
              ids.length === 0 ? (
                <Typography.Text type="secondary">Chưa có</Typography.Text>
              ) : (
                ids.map((id) => <Tag key={id}>{roleName(id)}</Tag>)
              ),
          },
          {
            title: "",
            key: "actions",
            width: 120,
            render: (_, row) => (
              <Button
                size="small"
                onClick={() => {
                  setEditing(row);
                  setRoleIds(row.roleIds);
                }}
              >
                Gán vai trò
              </Button>
            ),
          },
        ]}
      />

      <Modal
        open={addOpen}
        title="Thêm thành viên"
        okText="Thêm"
        cancelText="Hủy"
        onOk={onAdd}
        onCancel={() => setAddOpen(false)}
      >
        <Typography.Paragraph type="secondary">
          Nhập email của một tài khoản đã đăng ký để thêm vào tổ chức (gửi lời mời qua email sẽ có
          sau).
        </Typography.Paragraph>
        <Input
          placeholder="email@vi-du.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onPressEnter={onAdd}
        />
      </Modal>

      <Modal
        open={editing !== null}
        title={`Gán vai trò — ${editing?.email ?? ""}`}
        okText="Lưu"
        cancelText="Hủy"
        onOk={onAssign}
        onCancel={() => setEditing(null)}
      >
        <Select
          mode="multiple"
          style={{ width: "100%" }}
          placeholder="Chọn vai trò"
          value={roleIds}
          onChange={setRoleIds}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
        />
      </Modal>
    </div>
  );
}
