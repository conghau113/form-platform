import { DeleteOutlined, UserAddOutlined } from "@ant-design/icons";
import { App as AntApp, Button, Input, List, Modal, Select, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import * as api from "./client";
import type { MemberRole, ProjectMembersView, ProjectRecord } from "./types";

/** Vietnamese label per project role (matches the admin panel's role wording). */
const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ sở hữu",
  editor: "Biên tập",
  viewer: "Người xem",
};

const ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: "editor", label: ROLE_LABEL.editor },
  { value: "viewer", label: ROLE_LABEL.viewer },
];

/**
 * Project sharing dialog (W5). Lists the owner + collaborators and — for the project owner only —
 * grants, re-roles and revokes them. "Users" are `x-owner-id` strings (no registry yet), so a
 * grant is just a user id + role. The server enforces every rule; the UI round-trips then reloads.
 */
export function ShareDialog({
  project,
  onClose,
}: {
  project: ProjectRecord | null;
  onClose: () => void;
}) {
  const { message } = AntApp.useApp();
  const [view, setView] = useState<ProjectMembersView | null>(null);
  const [loading, setLoading] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<MemberRole>("editor");

  const { user } = useAuth();
  const isOwner = project?.ownerId === user?.id;
  const projectId = project?.id;

  const reload = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      setView(await api.listMembers(projectId));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId, message]);

  useEffect(() => {
    if (projectId) void reload();
    else setView(null);
  }, [projectId, reload]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await reload();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function onAdd() {
    if (!projectId || !newUserId.trim()) return;
    await run(() => api.grantMember(projectId, newUserId.trim(), newRole));
    setNewUserId("");
  }

  return (
    <Modal
      open={project !== null}
      title={`Chia sẻ "${project?.name ?? ""}"`}
      footer={null}
      onCancel={onClose}
    >
      <List
        loading={loading}
        size="small"
        header={
          <Typography.Text type="secondary">
            {isOwner
              ? "Mời cộng tác viên bằng user id của họ."
              : "Bạn được chia sẻ quyền truy cập dự án này; chỉ chủ sở hữu mới quản lý thành viên."}
          </Typography.Text>
        }
        dataSource={[
          { userId: view?.ownerId ?? "", role: "owner" as const, isOwnerRow: true },
          ...(view?.members ?? []).map((m) => ({ ...m, isOwnerRow: false })),
        ]}
        renderItem={(row) => (
          <List.Item
            actions={
              row.isOwnerRow || !isOwner
                ? []
                : [
                    <Select<MemberRole>
                      key="role"
                      size="small"
                      value={row.role as MemberRole}
                      options={ROLE_OPTIONS}
                      style={{ width: 96 }}
                      onChange={(role) =>
                        projectId && run(() => api.updateMemberRole(projectId, row.userId, role))
                      }
                    />,
                    <Button
                      key="remove"
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() =>
                        projectId && run(() => api.revokeMember(projectId, row.userId))
                      }
                    />,
                  ]
            }
          >
            <Space>
              <Typography.Text>{row.userId || "—"}</Typography.Text>
              {row.isOwnerRow ? (
                <Tag color="gold">{ROLE_LABEL.owner}</Tag>
              ) : !isOwner ? (
                <Tag>{ROLE_LABEL[row.role] ?? row.role}</Tag>
              ) : null}
            </Space>
          </List.Item>
        )}
      />

      {isOwner && (
        <Space.Compact style={{ width: "100%", marginTop: 12 }}>
          <Input
            placeholder="User id cần chia sẻ"
            value={newUserId}
            onChange={(e) => setNewUserId(e.target.value)}
            onPressEnter={onAdd}
          />
          <Select<MemberRole>
            value={newRole}
            options={ROLE_OPTIONS}
            style={{ width: 110 }}
            onChange={setNewRole}
          />
          <Button type="primary" icon={<UserAddOutlined />} onClick={onAdd}>
            Chia sẻ
          </Button>
        </Space.Compact>
      )}
    </Modal>
  );
}
