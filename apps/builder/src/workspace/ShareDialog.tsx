import { DeleteOutlined, UserAddOutlined } from "@ant-design/icons";
import { Button, Input, List, Modal, message, Select, Space, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import * as api from "./client";
import { OWNER_ID } from "./config";
import type { MemberRole, ProjectMembersView, ProjectRecord } from "./types";

const ROLE_OPTIONS: { value: MemberRole; label: string }[] = [
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
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
  const [view, setView] = useState<ProjectMembersView | null>(null);
  const [loading, setLoading] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<MemberRole>("editor");

  const isOwner = project?.ownerId === OWNER_ID;
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
  }, [projectId]);

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
      title={`Share "${project?.name ?? ""}"`}
      footer={null}
      onCancel={onClose}
    >
      <List
        loading={loading}
        size="small"
        header={
          <Typography.Text type="secondary">
            {isOwner
              ? "Invite collaborators by their user id."
              : "You have shared access to this project; only the owner can manage members."}
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
                <Tag color="gold">owner</Tag>
              ) : !isOwner ? (
                <Tag>{row.role}</Tag>
              ) : null}
            </Space>
          </List.Item>
        )}
      />

      {isOwner && (
        <Space.Compact style={{ width: "100%", marginTop: 12 }}>
          <Input
            placeholder="User id to share with"
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
            Share
          </Button>
        </Space.Compact>
      )}
    </Modal>
  );
}
