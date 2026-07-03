import {
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";
import {
  App as AntApp,
  Button,
  Card,
  Dropdown,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ShareDialog } from "./ShareDialog";
import type { ProjectRecord } from "./types";
import { useMyTenants, useProjects } from "./useWorkspace";

/**
 * Workspace landing page (`/projects`). Lists the owner's projects as cards; create, rename and
 * delete from here, then open one into the Explorer. Server is the source of truth via
 * {@link useProjects}.
 */
export function ProjectsPage() {
  const { message, modal } = AntApp.useApp();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { projects, loading, create, rename, remove } = useProjects();
  const { tenants } = useMyTenants();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [tenantChoice, setTenantChoice] = useState<string | undefined>(undefined);
  const [renaming, setRenaming] = useState<ProjectRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sharing, setSharing] = useState<ProjectRecord | null>(null);

  // Workspaces the user may create a project in (B4: editor+ per their RBAC role in the tenant).
  const creatable = tenants.filter((t) => t.projectRole === "owner" || t.projectRole === "editor");
  const defaultTenantId = (creatable.find((t) => t.personal) ?? creatable[0])?.id;

  async function onCreate() {
    if (!name.trim()) return;
    try {
      const target = creatable.find((t) => t.id === (tenantChoice ?? defaultTenantId));
      const project = await create({
        name: name.trim(),
        // Personal is the server default — only send an explicit target for a team workspace.
        ...(target && !target.personal ? { tenantId: target.id } : {}),
      });
      setCreating(false);
      setName("");
      navigate(`/projects/${project.id}`);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  async function onRename() {
    if (!renaming || !renameValue.trim()) return;
    try {
      await rename(renaming.id, renameValue.trim());
      setRenaming(null);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  function onDelete(project: ProjectRecord) {
    modal.confirm({
      title: `Delete project "${project.name}"?`,
      content: "This permanently deletes the project and every folder and form inside it.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await remove(project.id);
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Projects
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreating(true)}
          style={{ marginLeft: "auto" }}
        >
          New project
        </Button>
      </div>

      {loading ? (
        <Spin />
      ) : projects.length === 0 ? (
        <Empty description="No projects yet — create one to start." />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {projects.map((project) => {
            const owned = project.ownerId === user?.id;
            return (
              <Dropdown
                key={project.id}
                trigger={["contextMenu"]}
                menu={{
                  items: [
                    { key: "open", icon: <FolderOpenOutlined />, label: "Open" },
                    {
                      key: "share",
                      icon: <ShareAltOutlined />,
                      label: owned ? "Share" : "Members",
                    },
                    ...(owned
                      ? [
                          { key: "rename", icon: <EditOutlined />, label: "Rename" },
                          {
                            key: "delete",
                            icon: <DeleteOutlined />,
                            label: "Delete",
                            danger: true,
                          },
                        ]
                      : []),
                  ],
                  onClick: ({ key }) => {
                    if (key === "open") navigate(`/projects/${project.id}`);
                    else if (key === "share") setSharing(project);
                    else if (key === "rename") {
                      setRenaming(project);
                      setRenameValue(project.name);
                    } else if (key === "delete") onDelete(project);
                  },
                }}
              >
                <Card
                  hoverable
                  title={
                    <Space>
                      {project.name}
                      {!owned && <Tag color="blue">Shared</Tag>}
                    </Space>
                  }
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <Typography.Text type="secondary">
                    {project.description || "No description"}
                  </Typography.Text>
                </Card>
              </Dropdown>
            );
          })}
        </div>
      )}

      <Modal
        open={creating}
        title="New project"
        okText="Create"
        onOk={onCreate}
        onCancel={() => setCreating(false)}
        afterOpenChange={(open) => {
          if (!open) {
            setName("");
            setTenantChoice(undefined);
          }
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input
            autoFocus
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onPressEnter={onCreate}
          />
          {creatable.length > 1 && (
            <Select
              style={{ width: "100%" }}
              value={tenantChoice ?? defaultTenantId}
              onChange={setTenantChoice}
              options={creatable.map((t) => ({
                value: t.id,
                label: t.personal ? "Personal workspace" : t.name,
              }))}
            />
          )}
        </Space>
      </Modal>

      <Modal
        open={renaming !== null}
        title="Rename project"
        okText="Save"
        onOk={onRename}
        onCancel={() => setRenaming(null)}
      >
        <Input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={onRename}
        />
      </Modal>

      <ShareDialog project={sharing} onClose={() => setSharing(null)} />
    </div>
  );
}
