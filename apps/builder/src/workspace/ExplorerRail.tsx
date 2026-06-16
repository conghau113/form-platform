import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  FolderAddOutlined,
  FormOutlined,
  LeftOutlined,
} from "@ant-design/icons";
import type { MenuProps, TreeDataNode, TreeProps } from "antd";
import {
  Button,
  Dropdown,
  Input,
  message,
  Modal,
  Select,
  Spin,
  Tree,
  Typography,
} from "antd";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as api from "./client";
import { duplicateForm, newForm } from "./newForm";
import {
  buildTree,
  dropFolderId,
  formKey,
  parseKey,
  type WorkspaceNode,
} from "./tree";
import type { ProjectRecord, ProjectTree } from "./types";

/** A one-field text prompt (create / rename). Resolves the entered value to `onOk`. */
interface Prompt {
  title: string;
  okText: string;
  initial: string;
  onOk: (value: string) => void;
}

export interface ExplorerRailProps {
  projectId: string;
  projects: ProjectRecord[];
  tree: ProjectTree | null;
  loading: boolean;
  error: string | null;
  /** Refetch the tree after a mutation (rename/move/delete/create). */
  reload: () => Promise<void>;
  /** Form currently open in the editor pane — highlighted in the tree. */
  activeFormId?: string;
  collapsed?: boolean;
}

/**
 * Persistent Explorer rail (master side of the project workspace). Renders the folder/form tree
 * (antd `Tree` over {@link buildTree}) with single-click-to-open, drag-to-move, and a right-click
 * context menu. Tree data + `reload` are owned by the parent shell; this component is otherwise
 * self-contained (CRUD round-trips through {@link api} then `reload`s). Collapsible to a thin bar.
 */
export function ExplorerRail({
  projectId,
  projects,
  tree,
  loading,
  error,
  reload,
  activeFormId,
  collapsed = false,
}: ExplorerRailProps) {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const openForm = (id: string) =>
    navigate(`/projects/${projectId}/forms/${id}`);

  function ask(p: Prompt) {
    setPromptValue(p.initial);
    setPrompt(p);
  }
  function run(action: Promise<unknown>) {
    action.then(reload).catch((e) => message.error((e as Error).message));
  }

  // --- folder actions ---
  function createFolder(parentId: string | null) {
    ask({
      title: "New folder",
      okText: "Create",
      initial: "",
      onOk: (name) => run(api.createFolder({ projectId, parentId, name })),
    });
  }
  function renameFolder(id: string, current: string) {
    ask({
      title: "Rename folder",
      okText: "Save",
      initial: current,
      onOk: (name) => run(api.updateFolder(id, { name })),
    });
  }
  function deleteFolder(id: string, name: string) {
    Modal.confirm({
      title: `Delete folder "${name}"?`,
      content:
        "Sub-folders are deleted; forms inside move to the project root.",
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: () => run(api.deleteFolder(id, true)),
    });
  }

  // --- form actions ---
  function createForm(folderId: string | null) {
    ask({
      title: "New form",
      okText: "Create",
      initial: "",
      onOk: async (title) => {
        try {
          const saved = await api.saveForm(newForm(title), {
            projectId,
            folderId,
          });
          await reload();
          openForm(saved.id);
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  }
  function duplicate(id: string, folderId: string | null) {
    api
      .loadForm(id)
      .then((src) => api.saveForm(duplicateForm(src), { projectId, folderId }))
      .then(async (saved) => {
        await reload();
        openForm(saved.id);
      })
      .catch((e) => message.error((e as Error).message));
  }
  function renameForm(id: string, current: string) {
    ask({
      title: "Rename form",
      okText: "Save",
      initial: current,
      // Load the contract, set its title, re-save (no placement → keeps its folder).
      onOk: (title) =>
        run(api.loadForm(id).then((src) => api.saveForm({ ...src, title }))),
    });
  }
  function deleteForm(id: string, title: string) {
    Modal.confirm({
      title: `Delete form "${title}"?`,
      okText: "Delete",
      okButtonProps: { danger: true },
      onOk: () => run(api.deleteForm(id)),
    });
  }

  // --- drag-to-move ---
  const onDrop: TreeProps["onDrop"] = (info) => {
    const dragged = parseKey(String(info.dragNode.key));
    const target = dropFolderId(
      String(info.node.key),
      !info.dropToGap,
      tree?.folders ?? [],
      tree?.forms ?? []
    );
    if (dragged.kind === "form") run(api.moveForm(dragged.id, target));
    else run(api.updateFolder(dragged.id, { parentId: target }));
  };

  /** Context-menu items + click handler for one tree node (folder vs form actions). */
  function nodeMenu(node: WorkspaceNode): {
    items: MenuProps["items"];
    onClick: (k: string) => void;
  } {
    const formFolder = (): string | null =>
      tree?.forms.find((f) => f.id === node.id)?.folderId ?? null;
    const items: MenuProps["items"] =
      node.kind === "folder"
        ? [
            {
              key: "new-folder",
              icon: <FolderAddOutlined />,
              label: "New subfolder",
            },
            {
              key: "new-form",
              icon: <FileAddOutlined />,
              label: "New form here",
            },
            { key: "rename", icon: <EditOutlined />, label: "Rename" },
            {
              key: "delete",
              icon: <DeleteOutlined />,
              label: "Delete",
              danger: true,
            },
          ]
        : [
            { key: "open", icon: <FormOutlined />, label: "Open" },
            { key: "rename", icon: <EditOutlined />, label: "Rename" },
            { key: "duplicate", icon: <CopyOutlined />, label: "Duplicate" },
            {
              key: "delete",
              icon: <DeleteOutlined />,
              label: "Delete",
              danger: true,
            },
          ];

    const onClick = (key: string) => {
      if (node.kind === "folder") {
        if (key === "new-folder") createFolder(node.id);
        else if (key === "new-form") createForm(node.id);
        else if (key === "rename") renameFolder(node.id, node.title);
        else if (key === "delete") deleteFolder(node.id, node.title);
      } else if (key === "open") openForm(node.id);
      else if (key === "rename") renameForm(node.id, node.title);
      else if (key === "duplicate") duplicate(node.id, formFolder());
      else if (key === "delete") deleteForm(node.id, node.title);
    };
    return { items, onClick };
  }

  // Right-click context menu per node; single-click open is handled by Tree.onSelect.
  const titleRender = (data: TreeDataNode) => {
    const node = data as unknown as WorkspaceNode;
    const { items, onClick } = nodeMenu(node);
    return (
      <Dropdown
        trigger={["contextMenu"]}
        menu={{ items, onClick: ({ key }) => onClick(key) }}>
        <span style={{ userSelect: "none" }}>{node.title}</span>
      </Dropdown>
    );
  };

  if (collapsed) return null;

  const nodes = tree ? buildTree(tree.folders, tree.forms) : [];

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        borderRight: "1px solid rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}>
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}>
          <Link to="/projects">
            <Button
              type="text"
              icon={<LeftOutlined style={{ fontSize: 12 }} />}>
              <span style={{ fontWeight: 600 }}>PROJECTS</span>
            </Button>
          </Link>
        </div>
        <Select
          size="small"
          style={{ width: "100%", marginBottom: 8 }}
          value={projectId}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(value) => navigate(`/projects/${value}`)}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            size="small"
            icon={<FolderAddOutlined />}
            onClick={() => createFolder(null)}>
            Folder
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<FileAddOutlined />}
            onClick={() => createForm(null)}>
            Form
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 8 }}>
        {loading ? (
          <Spin />
        ) : error ? (
          <Typography.Text type="danger">{error}</Typography.Text>
        ) : nodes.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Empty project — create a folder or a form.
          </Typography.Text>
        ) : (
          <Tree
            draggable
            blockNode
            defaultExpandAll
            selectedKeys={activeFormId ? [formKey(activeFormId)] : []}
            treeData={nodes as unknown as TreeDataNode[]}
            titleRender={titleRender}
            onDrop={onDrop}
            onSelect={(_keys, info) => {
              const { kind, id } = parseKey(String(info.node.key));
              if (kind === "form") openForm(id);
            }}
          />
        )}
      </div>

      <Modal
        open={prompt !== null}
        title={prompt?.title}
        okText={prompt?.okText}
        onOk={() => {
          if (promptValue.trim()) prompt?.onOk(promptValue.trim());
          setPrompt(null);
        }}
        onCancel={() => setPrompt(null)}>
        <Input
          autoFocus
          value={promptValue}
          onChange={(e) => setPromptValue(e.target.value)}
          onPressEnter={() => {
            if (promptValue.trim()) prompt?.onOk(promptValue.trim());
            setPrompt(null);
          }}
        />
      </Modal>
    </aside>
  );
}
