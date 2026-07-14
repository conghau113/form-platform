import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  FileAddOutlined,
  FolderAddOutlined,
  FormOutlined,
  HistoryOutlined,
  LeftOutlined,
  PartitionOutlined,
  PlayCircleOutlined,
  ProfileOutlined,
  ShareAltOutlined,
} from "@ant-design/icons";
import type { MenuProps, TreeDataNode, TreeProps } from "antd";
import { App as AntApp, Button, Dropdown, Input, Select, Spin, Tree, Typography } from "antd";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import * as wfApi from "../workflow/client";
import { duplicateWorkflow, newWorkflow } from "../workflow/newWorkflow";
import * as api from "./client";
import { duplicateForm, newForm } from "./newForm";
import { ShareDialog } from "./ShareDialog";
import {
  allFolderKeys,
  buildTree,
  dropFolderId,
  folderKey,
  formKey,
  insertDraft,
  type NodeKind,
  parseKey,
  type WorkspaceNode,
  workflowKey,
} from "./tree";
import type { ProjectRecord, ProjectTree, WorkflowSummary } from "./types";

/** Tree key for the inline "Untitled" draft (VS Code-style create). Never collides with a real id. */
const DRAFT_KEY = "__draft__";

/** Placeholder text for the inline create/rename input, by node kind. */
const PLACEHOLDER: Record<NodeKind, string> = {
  folder: "Tên thư mục",
  form: "Tên biểu mẫu",
  workflow: "Tên quy trình",
};

/**
 * Active inline edit. `rename` swaps an existing node's label for an input; `create` injects a draft
 * node under `parentId` (`null` → root) that becomes a real folder/form/workflow on commit.
 */
type Editing =
  | { mode: "rename"; kind: NodeKind; id: string; value: string }
  | { mode: "create"; kind: NodeKind; parentId: string | null; value: string };

export interface ExplorerRailProps {
  projectId: string;
  projects: ProjectRecord[];
  tree: ProjectTree | null;
  /** The project's workflows (Workflow WF1) — shown in the tree alongside forms. */
  workflows: WorkflowSummary[];
  loading: boolean;
  error: string | null;
  /** Invalidate the cached tree + workflow list after a mutation (create/rename/move/delete). */
  invalidate: () => Promise<void>;
  /** Form currently open in the editor pane — highlighted in the tree. */
  activeFormId?: string;
  /** Workflow currently open in the editor pane — highlighted in the tree. */
  activeWorkflowId?: string;
  collapsed?: boolean;
}

/** Tree icon for a node kind (folders use antd's built-in switcher → none here). */
function kindIcon(kind: NodeKind) {
  if (kind === "form") return <FormOutlined style={{ marginRight: 6, color: "#1677ff" }} />;
  if (kind === "workflow")
    return <PartitionOutlined style={{ marginRight: 6, color: "#722ed1" }} />;
  return null;
}

/**
 * Persistent Explorer rail (master side of the project workspace). Renders the folder/form tree
 * (antd `Tree` over {@link buildTree}) with single-click-to-open, drag-to-move, and a right-click
 * context menu. Create + rename happen **inline in the tree** (VS Code-style: type into the node,
 * Enter to commit / Esc to cancel); only the destructive delete uses a confirm modal. Tree data +
 * `invalidate` are owned by the parent shell; this component is otherwise self-contained (CRUD
 * round-trips through {@link api} then `invalidate`s the cache). Collapsible to a thin bar.
 */
export function ExplorerRail({
  projectId,
  projects,
  tree,
  workflows,
  loading,
  error,
  invalidate,
  activeFormId,
  activeWorkflowId,
  collapsed = false,
}: ExplorerRailProps) {
  const { message, modal } = AntApp.useApp();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Editing | null>(null);
  // Controlled expansion: `null` means "default — expand everything"; once the user (or an inline
  // create) touches it, we keep an explicit set. Lets us force-open the parent when creating inside.
  const [expandedKeys, setExpandedKeys] = useState<string[] | null>(null);
  const [sharing, setSharing] = useState(false);
  // Guards the Esc→blur race: Escape cancels, but blurring the input would otherwise commit.
  const skipBlur = useRef(false);
  const currentProject = projects.find((p) => p.id === projectId) ?? null;

  const nodes = tree ? buildTree(tree.folders, tree.forms, workflows) : [];

  const openForm = (id: string) => navigate(`/projects/${projectId}/forms/${id}`);
  const openSubmissions = (id: string) =>
    navigate(`/projects/${projectId}/forms/${id}/submissions`);
  const openVersions = (id: string) => navigate(`/projects/${projectId}/forms/${id}/versions`);
  const openWorkflow = (id: string) => navigate(`/projects/${projectId}/workflows/${id}/edit`);
  const runWorkflow = (id: string) => navigate(`/projects/${projectId}/workflows/${id}/run`);

  function run(action: Promise<unknown>) {
    action.then(invalidate).catch((e) => message.error((e as Error).message));
  }

  // --- inline create / rename ---
  function ensureExpanded(folderId: string) {
    const key = folderKey(folderId);
    setExpandedKeys((prev) => {
      const base = prev ?? allFolderKeys(nodes);
      return base.includes(key) ? base : [...base, key];
    });
  }
  function startCreate(kind: NodeKind, parentId: string | null) {
    if (parentId !== null) ensureExpanded(parentId);
    setEditing({ mode: "create", kind, parentId, value: "" });
  }
  function startRename(kind: NodeKind, id: string, current: string) {
    setEditing({ mode: "rename", kind, id, value: current });
  }
  function commitEditing() {
    if (!editing) return;
    const ed = editing;
    const value = ed.value.trim();
    setEditing(null);
    if (!value) return; // empty → treat as cancel (no blank names)

    if (ed.mode === "rename") {
      if (ed.kind === "folder") run(api.updateFolder(ed.id, { name: value }));
      // Load the contract, set its title, re-save (no placement → keeps its folder).
      else if (ed.kind === "form")
        run(api.loadForm(ed.id).then((src) => api.saveForm({ ...src, title: value })));
      else
        run(wfApi.loadWorkflow(ed.id).then((src) => wfApi.saveWorkflow({ ...src, title: value })));
      return;
    }
    // create: round-trip then open the new form/workflow (folders just refresh the tree).
    if (ed.kind === "folder") {
      run(api.createFolder({ projectId, parentId: ed.parentId, name: value }));
    } else if (ed.kind === "form") {
      api
        .saveForm(newForm(value), { projectId, folderId: ed.parentId })
        .then(async (saved) => {
          await invalidate();
          openForm(saved.id);
        })
        .catch((e) => message.error((e as Error).message));
    } else {
      wfApi
        .saveWorkflow(newWorkflow(value), { projectId, folderId: ed.parentId })
        .then(async (saved) => {
          await invalidate();
          openWorkflow(saved.id);
        })
        .catch((e) => message.error((e as Error).message));
    }
  }

  // --- form actions (non-inline) ---
  function duplicate(id: string, folderId: string | null) {
    api
      .loadForm(id)
      .then((src) => api.saveForm(duplicateForm(src), { projectId, folderId }))
      .then(async (saved) => {
        await invalidate();
        openForm(saved.id);
      })
      .catch((e) => message.error((e as Error).message));
  }
  function deleteForm(id: string, title: string) {
    modal.confirm({
      title: `Xóa biểu mẫu "${title}"?`,
      okText: "Xóa",
      okButtonProps: { danger: true },
      onOk: () => run(api.deleteForm(id)),
    });
  }

  // --- folder actions (non-inline) ---
  function deleteFolder(id: string, name: string) {
    modal.confirm({
      title: `Xóa thư mục "${name}"?`,
      content: "Thư mục con sẽ bị xóa; các biểu mẫu bên trong chuyển về gốc dự án.",
      okText: "Xóa",
      okButtonProps: { danger: true },
      onOk: () => run(api.deleteFolder(id, true)),
    });
  }

  // --- workflow actions (non-inline) ---
  function duplicateWf(id: string, folderId: string | null) {
    wfApi
      .loadWorkflow(id)
      .then((src) => wfApi.saveWorkflow(duplicateWorkflow(src), { projectId, folderId }))
      .then(async (saved) => {
        await invalidate();
        openWorkflow(saved.id);
      })
      .catch((e) => message.error((e as Error).message));
  }
  function deleteWorkflow(id: string, title: string) {
    modal.confirm({
      title: `Xóa quy trình "${title}"?`,
      okText: "Xóa",
      okButtonProps: { danger: true },
      onOk: () => run(wfApi.deleteWorkflow(id)),
    });
  }

  // --- drag-to-move ---
  const onDrop: TreeProps["onDrop"] = (info) => {
    const dragged = parseKey(String(info.dragNode.key));
    const target = dropFolderId(
      String(info.node.key),
      !info.dropToGap,
      tree?.folders ?? [],
      tree?.forms ?? [],
      workflows,
    );
    if (dragged.kind === "form") run(api.moveForm(dragged.id, target));
    else if (dragged.kind === "workflow") run(wfApi.moveWorkflow(dragged.id, target));
    else run(api.updateFolder(dragged.id, { parentId: target }));
  };

  /** Context-menu items + click handler for one tree node (folder vs form actions). */
  function nodeMenu(node: WorkspaceNode): {
    items: MenuProps["items"];
    onClick: (k: string) => void;
  } {
    const formFolder = (): string | null =>
      tree?.forms.find((f) => f.id === node.id)?.folderId ?? null;
    const workflowFolder = (): string | null =>
      workflows.find((w) => w.id === node.id)?.folderId ?? null;
    const items: MenuProps["items"] =
      node.kind === "folder"
        ? [
            {
              key: "new-folder",
              icon: <FolderAddOutlined />,
              label: "Thư mục con mới",
            },
            {
              key: "new-form",
              icon: <FileAddOutlined />,
              label: "Biểu mẫu mới",
            },
            {
              key: "new-workflow",
              icon: <PartitionOutlined />,
              label: "Quy trình mới",
            },
            { key: "rename", icon: <EditOutlined />, label: "Đổi tên" },
            {
              key: "delete",
              icon: <DeleteOutlined />,
              label: "Xóa",
              danger: true,
            },
          ]
        : [
            { key: "open", icon: <FormOutlined />, label: "Mở" },
            ...(node.kind === "workflow"
              ? [{ key: "run", icon: <PlayCircleOutlined />, label: "Chạy" }]
              : [
                  { key: "submissions", icon: <ProfileOutlined />, label: "Câu trả lời" },
                  { key: "versions", icon: <HistoryOutlined />, label: "Phiên bản" },
                ]),
            { key: "rename", icon: <EditOutlined />, label: "Đổi tên" },
            { key: "duplicate", icon: <CopyOutlined />, label: "Nhân bản" },
            {
              key: "delete",
              icon: <DeleteOutlined />,
              label: "Xóa",
              danger: true,
            },
          ];

    const onClick = (key: string) => {
      if (node.kind === "folder") {
        if (key === "new-folder") startCreate("folder", node.id);
        else if (key === "new-form") startCreate("form", node.id);
        else if (key === "new-workflow") startCreate("workflow", node.id);
        else if (key === "rename") startRename("folder", node.id, node.title);
        else if (key === "delete") deleteFolder(node.id, node.title);
      } else if (node.kind === "workflow") {
        if (key === "open") openWorkflow(node.id);
        else if (key === "run") runWorkflow(node.id);
        else if (key === "rename") startRename("workflow", node.id, node.title);
        else if (key === "duplicate") duplicateWf(node.id, workflowFolder());
        else if (key === "delete") deleteWorkflow(node.id, node.title);
      } else if (key === "open") openForm(node.id);
      else if (key === "submissions") openSubmissions(node.id);
      else if (key === "versions") openVersions(node.id);
      else if (key === "rename") startRename("form", node.id, node.title);
      else if (key === "duplicate") duplicate(node.id, formFolder());
      else if (key === "delete") deleteForm(node.id, node.title);
    };
    return { items, onClick };
  }

  /** The inline create/rename input rendered in place of a node's label. */
  function editInput(kind: NodeKind, isRename: boolean) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        {kindIcon(kind)}
        <Input
          size="small"
          autoFocus
          style={{ width: 190 }}
          placeholder={PLACEHOLDER[kind]}
          value={editing?.value ?? ""}
          onFocus={isRename ? (e) => e.target.select() : undefined}
          // Stop the click reaching Tree.onSelect (which would navigate away mid-edit).
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setEditing((ed) => (ed ? { ...ed, value: e.target.value } : ed))}
          onPressEnter={commitEditing}
          onBlur={() => {
            if (skipBlur.current) {
              skipBlur.current = false;
              return;
            }
            commitEditing();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              skipBlur.current = true;
              setEditing(null);
            }
          }}
        />
      </span>
    );
  }

  // Right-click context menu per node; single-click open is handled by Tree.onSelect.
  const titleRender = (data: TreeDataNode) => {
    const node = data as unknown as WorkspaceNode;
    if (node.key === DRAFT_KEY) return editInput(node.kind, false);
    if (editing?.mode === "rename" && editing.kind === node.kind && editing.id === node.id)
      return editInput(node.kind, true);

    const { items, onClick } = nodeMenu(node);
    return (
      <Dropdown
        trigger={["contextMenu"]}
        menu={{
          items,
          // Stop the item click bubbling (React-portal) to the Tree row's onSelect, which would
          // ALSO navigate (openWorkflow → /edit) and override the menu action — e.g. "Run" landed
          // on the editor instead of /run.
          onClick: (info) => {
            info.domEvent.stopPropagation();
            onClick(info.key);
          },
        }}
      >
        {/* Full-width so the context menu fires anywhere on the row, not just over the text. */}
        <span style={{ userSelect: "none", display: "block", width: "100%" }}>
          {kindIcon(node.kind)}
          {node.title}
        </span>
      </Dropdown>
    );
  };

  if (collapsed) return null;

  // Inject the inline draft (create) into the rendered tree; expand fully unless user overrode it.
  const draftedNodes =
    editing?.mode === "create"
      ? insertDraft(nodes, editing.parentId, {
          key: DRAFT_KEY,
          kind: editing.kind,
          id: "",
          title: "",
          isLeaf: editing.kind !== "folder",
        })
      : nodes;
  const effectiveExpanded = expandedKeys ?? allFolderKeys(nodes);
  const selectedKeys = activeFormId
    ? [formKey(activeFormId)]
    : activeWorkflowId
      ? [workflowKey(activeWorkflowId)]
      : [];

  return (
    <aside
      style={{
        // Shrinks toward 220px on narrow viewports so the canvas keeps room.
        width: "clamp(220px, 20vw, 280px)",
        flexShrink: 0,
        borderRight: "1px solid rgba(0,0,0,0.08)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
          }}
        >
          <Link to="/projects">
            <Button type="text" icon={<LeftOutlined style={{ fontSize: 12 }} />}>
              <span style={{ fontWeight: 600 }}>DỰ ÁN</span>
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
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button
            size="small"
            icon={<FolderAddOutlined />}
            onClick={() => startCreate("folder", null)}
          >
            Thư mục
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<FileAddOutlined />}
            onClick={() => startCreate("form", null)}
          >
            Biểu mẫu
          </Button>
          <Button
            size="small"
            icon={<PartitionOutlined />}
            onClick={() => startCreate("workflow", null)}
          >
            Quy trình
          </Button>
          <Button
            size="small"
            icon={<ShareAltOutlined />}
            style={{ marginLeft: "auto" }}
            onClick={() => setSharing(true)}
          >
            Chia sẻ
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 8 }}>
        {loading ? (
          <Spin />
        ) : error ? (
          <Typography.Text type="danger">{error}</Typography.Text>
        ) : draftedNodes.length === 0 ? (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Dự án trống — tạo một thư mục hoặc biểu mẫu.
          </Typography.Text>
        ) : (
          <Tree
            draggable
            blockNode
            expandedKeys={effectiveExpanded}
            onExpand={(keys) => setExpandedKeys(keys.map(String))}
            selectedKeys={selectedKeys}
            treeData={draftedNodes as unknown as TreeDataNode[]}
            titleRender={titleRender}
            onDrop={onDrop}
            onSelect={(_keys, info) => {
              const key = String(info.node.key);
              if (key === DRAFT_KEY) return;
              const { kind, id } = parseKey(key);
              if (kind === "form") openForm(id);
              else if (kind === "workflow") openWorkflow(id);
            }}
          />
        )}
      </div>

      <ShareDialog project={sharing ? currentProject : null} onClose={() => setSharing(false)} />
    </aside>
  );
}
