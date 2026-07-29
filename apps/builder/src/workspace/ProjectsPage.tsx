import {
  ApartmentOutlined,
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
  TreeSelect,
  Typography,
} from "antd";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { getActiveTenantId } from "../lib/activeTenant";
import { buildOrgTree, useOrgUnits } from "../org-units";
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
  const { projects, loading, create, rename, setOrgUnit, remove } = useProjects();
  const { tenants } = useMyTenants();
  const { units } = useOrgUnits(true);
  const orgTree = useMemo(() => buildOrgTree(units), [units]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [tenantChoice, setTenantChoice] = useState<string | undefined>(undefined);
  const [orgChoice, setOrgChoice] = useState<string | undefined>(undefined);
  const [renaming, setRenaming] = useState<ProjectRecord | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [placing, setPlacing] = useState<ProjectRecord | null>(null);
  const [placeValue, setPlaceValue] = useState<string | undefined>(undefined);
  const [sharing, setSharing] = useState<ProjectRecord | null>(null);

  // Workspaces the user may create a project in (B4: editor+ per their RBAC role in the tenant).
  const creatable = tenants.filter((t) => t.projectRole === "owner" || t.projectRole === "editor");
  // Default to the workspace being viewed, so creating lands where the user is looking.
  const activeTenantId = getActiveTenantId();
  const defaultTenantId = (
    creatable.find((t) => t.id === activeTenantId) ??
    creatable.find((t) => t.personal) ??
    creatable[0]
  )?.id;

  async function onCreate() {
    if (!name.trim()) return;
    try {
      const target = creatable.find((t) => t.id === (tenantChoice ?? defaultTenantId));
      const project = await create({
        name: name.trim(),
        // Always explicit: the server's own default is the active workspace, which may differ from
        // what the picker shows (e.g. picking "personal" while viewing a team workspace).
        ...(target ? { tenantId: target.id } : {}),
        ...(orgChoice ? { orgUnitId: orgChoice } : {}),
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

  async function onPlace() {
    if (!placing) return;
    try {
      await setOrgUnit(placing.id, placeValue ?? null); // cleared → unplace
      message.success("Đã cập nhật đơn vị");
      setPlacing(null);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  function onDelete(project: ProjectRecord) {
    modal.confirm({
      title: `Xóa dự án "${project.name}"?`,
      content: "Thao tác này sẽ xóa vĩnh viễn dự án cùng mọi thư mục và biểu mẫu bên trong.",
      okText: "Xóa",
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
          Dự án
        </Typography.Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreating(true)}
          style={{ marginLeft: "auto" }}
        >
          Dự án mới
        </Button>
      </div>

      {loading ? (
        <Spin />
      ) : projects.length === 0 ? (
        <Empty description="Chưa có dự án nào — tạo một dự án để bắt đầu." />
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
                    { key: "open", icon: <FolderOpenOutlined />, label: "Mở" },
                    {
                      key: "share",
                      icon: <ShareAltOutlined />,
                      label: owned ? "Chia sẻ" : "Thành viên",
                    },
                    ...(owned
                      ? [
                          { key: "rename", icon: <EditOutlined />, label: "Đổi tên" },
                          ...(units.length > 0
                            ? [{ key: "org", icon: <ApartmentOutlined />, label: "Đặt đơn vị" }]
                            : []),
                          {
                            key: "delete",
                            icon: <DeleteOutlined />,
                            label: "Xóa",
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
                    } else if (key === "org") {
                      setPlacing(project);
                      setPlaceValue(project.orgUnitId ?? undefined);
                    } else if (key === "delete") onDelete(project);
                  },
                }}
              >
                <Card
                  hoverable
                  title={
                    <Space>
                      {project.name}
                      {!owned && <Tag color="blue">Được chia sẻ</Tag>}
                    </Space>
                  }
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <Typography.Text type="secondary">
                    {project.description || "Không có mô tả"}
                  </Typography.Text>
                </Card>
              </Dropdown>
            );
          })}
        </div>
      )}

      <Modal
        open={creating}
        title="Dự án mới"
        okText="Tạo"
        onOk={onCreate}
        onCancel={() => setCreating(false)}
        afterOpenChange={(open) => {
          if (!open) {
            setName("");
            setTenantChoice(undefined);
            setOrgChoice(undefined);
          }
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input
            autoFocus
            placeholder="Tên dự án"
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
                label: t.personal ? "Không gian cá nhân" : t.name,
              }))}
            />
          )}
          {units.length > 0 && (
            <TreeSelect
              style={{ width: "100%" }}
              treeData={orgTree}
              value={orgChoice}
              onChange={(v) => setOrgChoice(v as string | undefined)}
              placeholder="Đơn vị (tùy chọn)"
              treeDefaultExpandAll
              allowClear
            />
          )}
        </Space>
      </Modal>

      <Modal
        open={placing !== null}
        title="Đặt đơn vị cho dự án"
        okText="Lưu"
        cancelText="Hủy"
        onOk={onPlace}
        onCancel={() => setPlacing(null)}
      >
        <TreeSelect
          style={{ width: "100%" }}
          treeData={orgTree}
          value={placeValue}
          onChange={(v) => setPlaceValue(v as string | undefined)}
          placeholder="Không thuộc đơn vị nào"
          treeDefaultExpandAll
          allowClear
        />
      </Modal>

      <Modal
        open={renaming !== null}
        title="Đổi tên dự án"
        okText="Lưu"
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
